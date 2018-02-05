let net = require("net"),
    config = require("./config.json"),
    crypto = require("crypto");

var Miner = {
    job: null, //Job sent by pool

    hashes: 0, //Total processed hashes

    inProcess: false,

    id: crypto.randomBytes(12).toString("hex"),

    workerId: null, //Worker ID

    sending: 0, //Total sending hashes

    accepted: 0, //Total accepted hashes

    pool: null, //Pool connection

    //Function to start communication with the pool
    init: function(){
        this.pool = new net.Socket();
        var poolSettings = config.pool.split(':');
        this.pool.connect(poolSettings[1], poolSettings[0]);

        this.pool.on('connect', function(err) {
            if (err) console.error(err)
            else console.log("Connected to", poolSettings[0], poolSettings[1]);

            Miner.pool.write(JSON.stringify({
                "method": "login",
                "params": {
                    "login": config.wallet,
                    "pass": config.pass,
                    "agent": "cryptonight-miner"
                },
                "id": Miner.id
            }) + '\n');
        });

        this.pool.on('data', function(data) {
            var lines = String(data).split("\n");

            if (lines > 0) {
                for (let i = 0; i < lines.length; i++)
                    Miner.parseCommand(lines[i]);
            } else {
                Miner.parseCommand(data);
            }
        });

        this.pool.on('error', function(err) {
            console.log("Error: ", err);
        });

        this.pool.on('close', function(err) {
            console.log("Close: ", err);
            Miner.pool.destroy();
        });
    },

    //Function for handling commands sent by the pool
    parseCommand: function(data) {
        data = JSON.parse(data);

        if (data.result) {
            if (data.result.id) {
                console.log("Auth id:", data.result.id);
                this.workerId = data.result.id;
                this.setJob(data.result.job);
            } else if (data.result.status === 'OK') {
                this.accepted++;
                console.log("Accepted: " + this.sending + " / " + this.accepted);
            }
        } else if (data.method === 'job') {
            this.setJob(data.params);
        } else if (data.error){
            console.error("Error: ", data.error.message);
        }
    },

    //Function to configure job
    setJob: function(job) {
        console.log("Set job: ", job.job_id);
        this.job = job;

        if(!this.inProcess)
            this.work();
    },

    //Function to transform from hex to bytes
    hexToBytes: function(hex, bytes) {
        var bytes = new Uint8Array(hex.length / 2);

        for (var i = 0, c = 0; c < hex.length; c += 2, i++)
            bytes[i] = parseInt(hex.substr(c, 2), 16)

        return bytes
    },

    //Function to transform from bytes to hex
    bytesToHex: function(bytes) {
        for (var hex = "", i = 0; i < bytes.length; i++) {
            hex += (bytes[i] >>> 4).toString(16);
            hex += (bytes[i] & 15).toString(16)
        }

        return hex
    },

    //Function to verify hash and less than target
    meetsTarget: function(hash, target) {
        for (var i = 0; i < target.length; i++) {
            var hi = hash.length - i - 1,
                ti = target.length - i - 1;

            if (hash[hi] > target[ti])
                return false
            else if (hash[hi] < target[ti])
                return true
        }

        return false
    },

    //Function to send the result found to pool
    send: function(job_id, nonceHex, resultHex) {
        if (Miner.pool.writable) {
            Miner.pool.write(JSON.stringify({
                "method": "submit",
                "params": {
                    "id": Miner.workerId,
                    "job_id": job_id,
                    "nonce": nonceHex,
                    "result": resultHex
                },
                "id": Miner.id
            }) + '\n');

            Miner.sending++;
        } else {
            console.log("Error sending to pool");
        }
    },

    //Function to start work
    work: function() {
        this.inProcess = true;

        let criptonight = require("./cryptonight.js");
        criptonight.onRuntimeInitialized = function() {
            var meetsTarget = false;
            var start = Date.now();
            var elapsed = 0;

            do {
                var job = Miner.job;
                var target = new Uint8Array([255, 255, 255, 255, 255, 255, 255, 255]);
                var input = new Uint8Array(criptonight.HEAPU8.buffer, criptonight._malloc(84), 84);
                var output = new Uint8Array(criptonight.HEAPU8.buffer, criptonight._malloc(32), 32);
                var blob = Miner.hexToBytes(job.blob);
                input.set(blob);

                var targetBinary = Miner.hexToBytes(job.target);

                if (targetBinary.length <= 8) {
                    for (var i = 0; i < targetBinary.length; i++)
                        target[target.length - i - 1] = targetBinary[targetBinary.length - i - 1]

                    for (var i = 0; i < target.length - targetBinary.length; i++)
                        target[i] = 255
                } else {
                    target = targetBinary
                }

                var nonce = Math.random() * 4294967295 + 1 >>> 0;
                input[39] = (nonce & 4278190080) >> 24;
                input[40] = (nonce & 16711680) >> 16;
                input[41] = (nonce & 65280) >> 8;
                input[42] = (nonce & 255) >> 0;

                criptonight._cryptonight_hash(input.byteOffset, output.byteOffset, blob.length);

                Miner.hashes++;
                meetsTarget = Miner.meetsTarget(output, target);
                elapsed = Date.now() - start

                if (meetsTarget) {
                    var nonceHex = Miner.bytesToHex(input.subarray(39, 43));
                    var resultHex = Miner.bytesToHex(output);

                    var hashesPerSecond = Miner.hashes / (elapsed / 1000);

                    if(typeof process.send == "function")
                        process.send({hashesPerSecond: hashesPerSecond, hashes: Miner.hashes, accepted: Miner.accepted});
                    else
                        console.log("Found: " + nonceHex + " / " + resultHex + " - " + hashesPerSecond + "h/s");

                    Miner.send(job.job_id, nonceHex, resultHex);
                } else {
                    //var hashesPerSecond = Miner.hashes / (elapsed / 1000);
                    //console.log("Hashrate: " + hashesPerSecond + " / Total: " + Miner.hashes);
                }
            } while (true);
        }
    }
}

Miner.init();
