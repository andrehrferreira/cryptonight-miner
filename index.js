let cluster = require("cluster"),
    hashesPerSecond = {},
    hashes = {},
    accepted = {};

if (cluster.isMaster) {
    const cpus = require("os").cpus().length;

    for(var i = 0; i < cpus; i++) {
        let worker = cluster.fork();

        worker.on('message', function(msg) {
            hashesPerSecond[worker.process.pid] = msg.hashesPerSecond
            hashes[worker.process.pid] = msg.hashes;
            accepted[worker.process.pid] = msg.accepted;
        });
    }

    setInterval(function(){
        console.clear();

        var totalhashesPerSecond = 0,
            totalhashes = 0;

        for(let key in hashesPerSecond){
            totalhashesPerSecond += hashesPerSecond[key];
            totalhashes += hashes[key];
        }

        console.log("Hashrate: " + totalhashesPerSecond.toFixed(2) + "h/s\nTotal hashes: " + totalhashes);
    }, 1000);
} else{
    require("./miner.js");
}
