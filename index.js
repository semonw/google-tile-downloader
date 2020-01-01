//var request = require('request');
var format = require('string-format');
var fs = require('fs');
const path = require('path');
var request = require('superagent')
var stream = require('stream');

var agents = [
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.101 Safari/537.36',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.0 Safari/532.5',
    'Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.310.0 Safari/532.9',
    'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.514.0 Safari/534.7',
    'Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/9.0.601.0 Safari/534.14',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/10.0.601.0 Safari/534.14',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.672.2 Safari/534.20", "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.27 (KHTML, like Gecko) Chrome/12.0.712.0 Safari/534.27',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.24 Safari/535.1']

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
    for (var z = minZoom; z < maxZoom + 1; z++) {
        var lefttop = deg2num(maxY, minX, z)
        var rightbottom = deg2num(minY, maxX, z)
        console.log(format('范围：{}, {}, {}, {}, {}', z, lefttop[0], rightbottom[0], lefttop[1], rightbottom[1]));
        console.log(format('共：{}, {} x {} = {} 块瓦片', z, rightbottom[0] - lefttop[0], rightbottom[1] - lefttop[1], (rightbottom[0] - lefttop[0]) * (rightbottom[1] - lefttop[1])));
        downloadTerrainTiles(rootDir, z, lefttop[0], rightbottom[0], lefttop[1], rightbottom[1])
    }
}

function getTilesOfGlobal(minzoom, maxzoom) {
    for (var i = minzoom; i < maxzoom + 1; i++) {
        downloadTerrainTiles(i, 0, 2 ** i, 0, 2 ** i);
    }
}

function downloadTerrainTiles(rootDir, zoom, startX, endX, startY, endY) {
    for (var x = startX; x < endX; x++) {
        for (var y = startY; y < endY; y++) {
            var xDir = path.join(rootDir, zoom.toString(), x.toString());
            if (!fs.existsSync(xDir)) {
                fs.mkdirSync(xDir);
            }
            downloadTile(rootDir, zoom, x, y);
        }
    }
}

function downloadTile(rootDir, z, x, y) {
    //谷歌影像
    var tilepath = format('http://www.google.cn/maps/vt?lyrs=s@815&gl=cn&x={0}&y={1}&z={2}', x, y, z);
    var fpath = path.join(rootDir, z.toString(), x.toString(), y.toString() + '.png');
    var randomAgent = choice(0, 8);
    // console.log(tilepath);
    // console.log(fpath);
    // console.log(randomAgent);
    // console.log(agents[randomAgent]);
    // request({
    //     baseUrl: 'http://www.google.cn/maps/',
    //     url: tilepath,
    //     method: 'get',
    //     jar : j,
    //     headers: [
    //         'User-Agent', agents[randomAgent]
    //     ]
    // }, function (err, response, body) {
    //     if (err) {
    //         console.log('发生了错误:' + err);
    //     }
    //     // if (response) {
    //     //     console.log(response.statusCode);
    //     //     console.log(response.headers['content-type']);
    //     // }

    //     // if (body) {
    //     //     console.log(body);
    //     // }
    // }).pipe(fs.createWriteStream(fpath));

    request
        .get(tilepath)
        .set({ 'User-Agent': agents[randomAgent] })
        .end(function (err, res) {
            if (err) {
                //TODO 需要进一步处理超时，重新拉起请求
                console.log(err);
            }

            if (res) {
                //console.log(res.status);
                //console.log(res.type);
                if (res.body) {
                    if (Buffer.isBuffer(res.body)) {
                        //console.log('piping res body to file stream.');
                        var bs = new stream.PassThrough();
                        bs.end(res.body);
                        bs.pipe(fs.createWriteStream(fpath));
                    }
                }
            }
        });
}


function choice(min, max) {
    return Math.floor(Math.random() * max);
}


function main() {
    //getTilesOfGlobal(1, 4);
    var minZoom = 0   //下载的开始级别
    var maxZoom = 17  //下载的最大级别
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

    getByBound(rootDir, minZoom, maxZoom, minX, maxX, minY, maxY);
}

main();