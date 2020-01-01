var format = require('string-format');
var fs = require('fs');
const path = require('path');
var request = require('superagent');
var stream = require('stream');
var log4js = require('log4js');
log4js.configure({
    appenders: {
        logConsole: {
            type: "console"
        },
        logFile: {
            type: 'file',
            filename: 'default.log'
        }
    },
    categories: {
        default: {  //默认使用打印日志的方式
          appenders: ['logFile'], // 指定为上面定义的appender，如果不指定，无法写入
          level: 'all'       //打印日志的级别
        },
        logFile: {
          appenders: ['logFile'],
          level: 'all'
        },
        logConsole: {
          appenders: ['logConsole'],
          level: log4js.levels.ALL
        }
      }
})
var logger = log4js.getLogger('logFile');

var agents = [
    'Mozilla/5.0 (Windows NT 6.1; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.101 Safari/537.36',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/532.5 (KHTML, like Gecko) Chrome/4.0.249.0 Safari/532.5',
    'Mozilla/5.0 (Windows; U; Windows NT 5.2; en-US) AppleWebKit/532.9 (KHTML, like Gecko) Chrome/5.0.310.0 Safari/532.9',
    'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US) AppleWebKit/534.7 (KHTML, like Gecko) Chrome/7.0.514.0 Safari/534.7',
    'Mozilla/5.0 (Windows; U; Windows NT 6.0; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/9.0.601.0 Safari/534.14',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.14 (KHTML, like Gecko) Chrome/10.0.601.0 Safari/534.14',
    'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-US) AppleWebKit/534.20 (KHTML, like Gecko) Chrome/11.0.672.2 Safari/534.20", "Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/534.27 (KHTML, like Gecko) Chrome/12.0.712.0 Safari/534.27',
    'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/535.1 (KHTML, like Gecko) Chrome/13.0.782.24 Safari/535.1'
]

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

    logger.info('发出请求:' + tilepath);
    
    request
        .get(tilepath)
        .set({
            'User-Agent': agents[randomAgent]
        })
        .timeout({
            response: 5000, // Wait 5 seconds for the server to start sending,
            deadline: 60000 // but allow 1 minute for the file to finish loading.
        })
        .redirects(2) // only allow redirect 2 times.
        // .on('error', function(err){
        //     if(err){
        //         logger.error('错误码：' + err.status);
        //         logger.error('错误相应:' + err.response);
        //     }
        // })
        .then((res) => {
            if (res) {
                logger.info('请求成功, status' + res.status + ", type:" + res.type);
                if (res.body) {
                    if (Buffer.isBuffer(res.body)) {
                        //console.log('piping res body to file stream.');
                        var bs = new stream.PassThrough();
                        bs.end(res.body);
                        bs.pipe(fs.createWriteStream(fpath));
                    }
                }
                else{
                    logger.error('请求错误，请求中没有body数据');
                }
            }
        })
        .catch(err => {
            if (err) {
                if (err.timeout) {
                    logger.error("请求超时：" + err.timeout + 'ms');
                }
                logger.error('发生了请求错误:' + err);
            }
        });
}


function choice(min, max) {
    return Math.floor(Math.random() * max);
}


function main() {
    //getTilesOfGlobal(1, 4);
    var minZoom = 13 //下载的开始级别
    var maxZoom = 13 //下载的最大级别
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
    getByBound(rootDir, minZoom, maxZoom, minX, maxX, minY, maxY);
    var ep2 = new Date().getTime();

    console.log(ep1);
    console.log(ep2);
    console.log('time consumed ' + ((ep2 - ep1) / 1000) + ' s');
}

main();