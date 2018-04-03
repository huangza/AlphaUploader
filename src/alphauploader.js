/*
 * Alpha Uploader
 * Author: Andre Huang
 * Update: 20170913
 */
;(function($){
    var log = console.log.bind(console);
    var noop = $.noop;
    var defaultOpts = {
        accept: '',                                 // 格式限制
        // compress: noop,                          // 是否压缩
        compress: {                                 // （配置）
            enable: false,
            width: 1000,
            height: 750,
            quality: 0.9,
            limit: noop,
        },
        autoUpload: true,                           // 自动上传
        mode: 'formdata',                           // 发送给服务器的模式
        formData: noop,                             // formData附带的数据
        fileName: 'myFile',                         // 发送文件的字段名
        fileSizeLimit: noop,                        // 文件大小限制
        server: noop,                               // 上传地址
    };
    var STATE_READY = 'ready',
        STATE_PROCESS = 'process',
        STATE_COMPLETE = 'complete';
    // 错误策略类
    var errorHandlers = {
        invalidFormat: function() {
            return '上传的文件格式不符合要求';
        },
        failToUpload: function() {
            // console.error('上传失败');
            return '上传失败';
        },
        fileOversize: function() {
            // console.error('上传的文件大小超过限制');
            return '上传的文件大小超过限制';
        }
    };
    // 根据不同请求格式作不同处理
    // 这里分 formdata 方式，和直接发送 base64 串的方式
    var modeHandlers = {
        formdata: function(context) {
            var blob = context._helper.blob,
                url = context.option.server,
                data = context.option.formData,
                name = context.option.fileName,
                fileName = context.file.name;
            var formData = new FormData();

            formData.append(name, blob, fileName);
            formData.append('filesize', blob.size);

            if (data) {
                for(var k in data) {
                    if (data.hasOwnProperty(k)) {
                        formData.append(k, data[k]);
                    }
                }
            }

            // console.log(blob);

            if (url) {
                $.ajax({
                    type: 'POST',
                    url: url,
                    data: formData,
                    contentType: false,
                    processData: false,
                    success : function(res){
                        // console.log(res);
                        context.emit({
                            type: 'uploadSuccess',
                            content: res
                        });
                    },
                    error: function(error){
                        // console.log(error);
                        context.emit({
                            type: 'uploadError',
                            content: 'Fail to request.',
                            response: error
                        });
                    }
                });
            }
        },
        base64: function(context) {
            log(context);
        }
    };
    var cacheImg = null;

    // 上传对象类
    function AlphaUploader(element, opts) {
        // 状态
        this.state = STATE_READY;
        // 配置
        this.option = opts;
        // 绑定的dom元素
        this.element = element;
        // 文件
        this.file = Object.create(null);
        // 事件对象
        this._event = Object.create(null);
        // 辅助对象
        this._helper = {
            quality: this.option.compress.quality
        };

        this.init();
    }

    AlphaUploader.prototype = {
        // 初始化
        init: function() {
            // log('init', this);

            var me = this;

            this
            .on('fileQueue', function() {                           // hook：添加文件
                // log('fileQueued');

                // 需要压缩时
                if (me.option.compress.enable) {
                    return me.compress();
                    // log(me)
                }
                // 自动上传时
                if (me.option.autoUpload === true) {
                    return me.emit({
                        type: 'startUpload'
                    });
                }
            })
            // .on('fileCompressed', function() {
            //     me.makeThumb();
            // })
            .on('error', function(event) {                          // hook：错误事件
                var content = event.content;
                console.error(content);
                    // code = event.code;
                // errorHandlers[code]();
            })
            .on('uploadSuccess', function() {                       // hook：上传成功
                me.state = STATE_COMPLETE;
            })
            .on('uploadError', function() {                         // hook：上传失败
                me.state = STATE_READY;
                var content = errorHandlers.failToUpload();
                me.emit({
                    type: 'error',
                    content: content
                });
            })
            .on('uploadComplete', function() {})                    // discard
            .on('beforeUpload', function() {})                      // hook：上传前
            .on('startUpload', function() {                         // hook：开始上传
                me.state = STATE_PROCESS;
                // me.upload();
                log(me);
            });
        },
        // (选取了文件后调用的方法) 添加文件
        addFile: function(file) {
            var me = this;
            var event = null;

            // log('addFile', this, file);

            // 格式限制
            if (validType(file, me.option.accept) !== true) {
                var content = errorHandlers.invalidFormat();
                event = {
                    type: 'error',
                    content: content
                };
                return me.emit(event);
            }
            // if (validType.call(this, file) !== true) {
            //     var content = errorHandlers.invalidFormat();
            //     event = {
            //         type: 'error',
            //         content: content
            //     };
            //     return me.emit(event);
            // }

            // 大小限制
            if (validSize(file, this.option.fileSizeLimit) !== true) {
                event = {
                    type: 'error',
                    content: errorHandlers.fileOversize()
                };
                return me.emit(event);
            }
            // if (validSize.call(file, this.option.fileSizeLimit) !== true) {
            //     event = {
            //         type: 'error',
            //         content: errorHandlers.fileOversize()
            //     };
            //     return me.emit(event);
            // }

            me.file.originFile = file;

            event = {
                type: 'fileQueue'
            };
            // 触发钩子事件
            return me.emit(event);
        },
        // 生成缩略图，参数：上传的图片，完成后的回调函数
        makeThumb: function(callback) {

            callback.call(Object.create(null), cacheImg);
            // console.log('thumb', me._helper.blob);
        },
        // 绑定事件
        // type: 事件类型
        on: function(type, fn) {
            var _e = this._event;
            if (typeof _e[type] === 'undefined') {
                _e[type] = [];
            }
            _e[type].push(fn);

            return this;
        },
        off: function(type, fn) {
            var _e = this._event;
            if (_e[type] instanceof Array === true) {
                var fns = _e[type];

                for(var i = fns.length; i--; ) {
                    if (fns[i] == fn) {
                        break;
                    }
                }

                fns.splice(i, 1);
            }

            return this;
        },
        emit: function(event) {
            var _e = this._event,
                type = event.type;

            if (!event.target) {
                event.target = this;
            }

            if (_e[type] instanceof Array === true) {
                var fns = _e[type];

                for(var i = 0, len = fns.length; i < len; i++) {
                    // fns[i](event);
                    fns[i].call(this, event);
                }
            }

            return this;
        },
        // 上传操作
        upload: function() {
            var mode = this.option.mode;
            this.emit({
                type: 'beforeUpload'
            });
            modeHandlers[mode](this);
        },
        // 获取处理后的file对象
        getFile: function() {
            return this.file;
        },
        // 获取原始file对象
        getOriginFile: function() {
            return this.file.originFile;
        },
        compress: function () {
            var me = this,
                file = me.getOriginFile();
            var readImgThis = readImg.bind(me),
                paintImgThis = paintImg.bind(me),
                resizeImgThis = resizeImg.bind(me),
                canvasToBlobThis = canvasToBlob.bind(me);
            // 读取
            readImgThis(file)
                .then(paintImgThis)
                .then(resizeImgThis)
                .then(canvasToBlobThis)
                .then(function(blob){
                    // log('compress', me._helper.quality, blob.size, me.option.compress.limit);
                    if (blob.size > me.option.compress.limit) {
                        // return setTimeout(function(){
                            return me.compress();
                        // }, 7000);
                    }
                    // reset
                    // log('reset');
                    me._helper.quality = me.option.compress.quality;

                    me.emit({
                        type: 'fileCompressed'
                    });

                    if (me.option.autoUpload === true) {
                        return me.emit({
                            type: 'startUpload'
                        });
                    }
                });
        }
    };

    function validType(file, suffixs) {
        var type = file.type;

        if (type === '') {
            return false;
        }

        if (suffixs === '') {
            return true;
        }

        type = type.slice(type.indexOf('/') + 1);
        return suffixs.indexOf(type) > -1;
    }

    function validSize(file, fileSizeLimit) {
        return file.size <= fileSizeLimit;
    }

    // 读取
    function readImg(file) {
        if (!FileReader) {
            console.error('Unable to read the file.');
            return false;
        }
        return new Promise(function(resolve) {
            var reader = new FileReader();

            reader.onload = function(e) {
                // console.log('reader', e);
                // callback.call(null, e.target.result);

                // log('callback后');

                if (e.target.error) {
                    return reject(e.target.error);
                }
                cacheImg = e.target.result;
                return resolve(e.target.result);
            };

            reader.readAsDataURL(file);
        });
    }

    function paintImg(base64File) {
        var me = this;
        // log('compress')
        return new Promise(function(resolve) {
            var _me = me,
                _helper = _me._helper;
            var img = new Image();
            var cvs = _helper.canvas = _helper.canvas || document.createElement('canvas');

            img.src = base64File;

            img.onload = function() {
                resolve({img: this, canvas: cvs});
            };

            // log(cvs);
            // log(ctx);
        });
    }

    function resizeImg(obj) {
        var me = this;
        return new Promise(function(resolve, reject) {
            var MAX_WIDTH = me.option.compress.width,
                MAX_HEIGHT = me.option.compress.height;
            var img = obj.img,
                canvas = obj.canvas;
            var size = getSize(img, MAX_WIDTH, MAX_HEIGHT),
                w = size.w,
                h = size.h,
                cvs = canvas,
                ctx = cvs.getContext('2d');

            cvs.width = size.w;
            cvs.height = size.h;

            ctx.drawImage(img, 0, 0, w, h);

            return resolve(cvs);
        });
    }

    function canvasToBlob(canvas) {
        var me = this;
        // me._helper.quality = 1;

        return new Promise(function(resolve) {
            var _me = me;
            // var dataURL = canvas.toDataURL('image/jpeg');
            
            _me._helper.quality -= 0.05;

            var quality = _me._helper.quality;
            if (quality <= 0) {
                return reject('EXCEED SIZE');
            }

            var dataURL = canvas.toDataURL('image/jpeg', quality);
            var blob = dataURLToBlob(dataURL);
            me._helper.blob = blob;
            return resolve(blob);
        });
    }

    function dataURLToBlob(dataURL) {
        // var byteStr,
        //     mimeStr;
        // var dataURLArr = dataURL.split(',');
        // if (dataURLArr[0].indexOf('base64') >= 0) {
        //     byteStr = atob(dataURLArr[1]);
        // } else {
        //     byteStr = unescape(dataURLArr[1]);
        // }

        // mimeStr = dataURLArr[0].split(':')[1].split(';')[0];

        // var ia = new Uint8Array(byteStr.length);
        // for(var i = 0; i < byteStr.length; i++) {
        //     ia[i] = byteStr.charCodeAt(i);
        // }

        // return new Blob([ia], {type: mimeStr});

        var arr = dataURL.split(','), mime = arr[0].match(/:(.*?);/)[1],
            bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
        while(n--){
            u8arr[n] = bstr.charCodeAt(n);
        }
        return new Blob([u8arr], {type:mime});
    }

    function getSize(img, MAX_WIDTH, MAX_HEIGHT) {
        // var WIDTH = 1000,
        //     HEIGHT = 750;
        // var MAX_WIDTH,
        //     MAX_HEIGHT;

        var w = img.width,
            h = img.height;

        if (w >= h) {
            if (w > MAX_WIDTH) {
                h *= MAX_WIDTH / w;
                w = MAX_WIDTH;
            }
        } else {
            if (h > MAX_HEIGHT) {
                w *= MAX_HEIGHT / h;
                h = MAX_HEIGHT;
            }
        }

        return {
            w: w,
            h: h
        };
    }

    $.fn.alphaUploader =  function(opts) {
        if (!$.isPlainObject(opts)) {
            opts = {};
        }
        // console.time(1);
        opts = $.extend(true, {}, defaultOpts, opts);
        // console.timeEnd(1);

        // var ret = [];
        // this.each(function() {
        //     ret.push(new AlphaUploader(this, opts));
        // });
        // return ret;

        var len = this.length;
        if (len > 1) {
            var ret = [];
            this.each(function() {
                ret.push(new AlphaUploader(this, opts));
            });
            return ret;

        } else {
            return new AlphaUploader(this[0], opts);
        }
    };
})($);