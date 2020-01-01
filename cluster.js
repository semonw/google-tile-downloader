const cluster = require('cluster');
const path = require('path');
const fs = require('fs');
var format = require('string-format');

//创建子进程数
var numCPUs = require('os').cpus().length;

function radians(degrees) {
    var pi = Math.PI;
    return degrees * (pi / 180);
}

function deg2num(lat_deg, lon_deg, zoom) {
    var lat_rad = radians(lat_deg);
    var n = 2.0 ** zoom;
    var xtile = Math.floor((lon_deg + 180.0) / 360.0 * n);
    var ytile = Math.floor((1.0 - Math.log(Math.tan(lat_rad) + (1 / Math.cos(lat_rad))) / Math.PI) / 2.0 * n);
    return [xtile, ytile];
}


function getByBound(rootDir, minZoom, maxZoom, minX, maxX, minY, maxY) {
    var reqs = [];
    for (var z = minZoom; z < maxZoom + 1; z++) {
        var lefttop = deg2num(maxY, minX, z)
        var rightbottom = deg2num(minY, maxX, z)
        console.log(format('范围：{}, {}, {}, {}, {}', z, lefttop[0], rightbottom[0], lefttop[1], rightbottom[1]));
        console.log(format('共：{}, {} x {} = {} 块瓦片', z, rightbottom[0] - lefttop[0], rightbottom[1] - lefttop[1], (rightbottom[0] - lefttop[0]) * (rightbottom[1] - lefttop[1])));
        var batch = downloadTerrainTiles(rootDir, z, lefttop[0], rightbottom[0], lefttop[1], rightbottom[1]);
        reqs = reqs.concat(batch);
    }

    return reqs;
}

function downloadTerrainTiles(rootDir, zoom, startX, endX, startY, endY) {
    var reqs = [];
    for (var x = startX; x < endX; x++) {
        for (var y = startY; y < endY; y++) {
            var xDir = path.join(rootDir, zoom.toString(), x.toString());
            if (!fs.existsSync(xDir)) {
                fs.mkdirSync(xDir);
            }
            reqs.push([rootDir, zoom, x, y]);
        }
    }
    return reqs;
}

function generateReqs() {
    //getTilesOfGlobal(1, 4);
    var minZoom = 0 //下载的开始级别
    var maxZoom = 17 //下载的最大级别
    var minX = 104.588008
    var maxX = 105.170268
    var minY = 32.214785
    var maxY = 32.70365

    var rootDir = path.join(process.cwd(), 'google_tiles');
    if (!fs.existsSync(rootDir)) {
        fs.mkdirSync(rootDir);
    }

    for (var z = minZoom; z <= maxZoom; z++) {
        var zDir = path.join(rootDir, z.toString());
        if (!fs.existsSync(zDir)) {
            fs.mkdirSync(zDir);
        }
    }

    var ep1 = new Date().getTime();
    reqs = getByBound(rootDir, minZoom, maxZoom, minX, maxX, minY, maxY);
    var ep2 = new Date().getTime();

    console.log('总共有' + reqs.length + '个请求.');

    return reqs;
}

if (cluster.isMaster) {
    console.log('这里是主进程。');
    var reqs = generateReqs();

    function redispatch(msg) {
        if (msg && msg.cmd && msg.cmd == 'result') {
            if (msg.status == 0) {
                if (reqs && reqs.length > 0) {
                    var batch = reqs.splice(0, 50);
                    cluster.workers[msg.id].send(batch);
                    console.log('向子进程发送任务消息。');
                }
            } else {
                console.log('子进程处理错误， msg : ' + msg);
            }
        }
    }

    //拿到所有的数据
    for (var i = 0; i < numCPUs; i++) {
        cluster.fork();
    }
    console.log('一共创建' + numCPUs + ' 个进程。');

    for (const id in cluster.workers) {
        cluster.workers[id].on('message', redispatch);
    }

    for (const id in cluster.workers) {
        var batch = reqs.splice(0, 50);
        cluster.workers[id].send(batch);
        console.log('发送初始任务消息.');
    }

    setInterval(() => {
        if(reqs.len == 0){
            console.log('任务已经处理完成。');
            for (const id in cluster.workers) {
                cluster.workers[id].kill();
            }

            console.log('主进程退出。');
            process.exit();
        }
    }, 1000);

} else if (cluster.isWorker) {
    console.log(`这是工作进程 #${cluster.worker.id}`);

    const processor = require('./processor.js');
    cluster.worker.on('message', function (msg) {
        processor.processReq(msg);
    });
}
