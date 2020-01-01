var format = require('string-format');
var fs = require('fs');
const path = require('path');
var request = require('superagent');
var stream = require('stream');
var log4js = require('log4js');
var Promise = require('bluebird');
const cluster = require('cluster');

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
        default: { //默认使用打印日志的方式
            appenders: ['logFile'], // 指定为上面定义的appender，如果不指定，无法写入
            level: 'all' //打印日志的级别
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

function choice(min, max) {
    return Math.floor(Math.random() * max);
}

function downloadTile(rootDir, z, x, y) {
    //谷歌影像
    var tilepath = format('http://www.google.cn/maps/vt?lyrs=s@815&gl=cn&x={0}&y={1}&z={2}', x, y, z);
    var fpath = path.join(rootDir, z.toString(), x.toString(), y.toString() + '.png');
    var randomAgent = choice(0, 8);

    logger.info('发出请求:' + tilepath);

    return request
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
                } else {
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


var Processor = function () {};
Processor.prototype.processReq = function (reqs) {
    if (!reqs) {
        logger.error('传入数据错误');
    }

    if (!Array.isArray(reqs)) {
        logger.error('传入数据错误');
    }

    let promises = [];
    reqs.forEach(req => {
        promises.push(downloadTile(req[0], req[1], req[2], req[3]));
    });

    console.log('一共发出请求 ' + promises.length + ' 个');
    Promise.all(promises).then(() => {
        console.log('请求都已经完成.....');

        process.send({
            cmd: 'result',
            id: cluster.worker.id,
            status: 0,
        });

    }).catch(err => {
        status = 1;
        console.log('发生了错误' + err);

        process.send({
            cmd: 'result',
            id: cluster.worker.id,
            status: 0,
            error : err
        });
    });

};

module.exports = new Processor();