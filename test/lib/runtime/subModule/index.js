/**
 * 根据模板返回结果，深度查找子模块，并加载到页面上,
 * puzzle标签会保留，用来标记位置，方便每个模块单独 update
 */

if (typeof define !== "function") {
    var define = require("amdefine")(module);
}

define(function (require, exports, module) {
    require('setimmediate');
    var find = require('./find'),
        reduce = require('./reduce'),
        requireMod = require('./requireMod'),
        asyncSubCount = 0,
        $ = require('jquery'),
        $s = require('../jsonselect'),
        ke = require('../kEvent'),
        utils = require('../../utils'),
        db = require('../dataCache');

    /**
     * 处理子模块
     * @param sub  当前要处理的子模块 puzzle 配置
     * @param curModule 调用子模块的模块（当前渲染的模块） id 号
     * @param mod 当前要处理的子模块对象
     * @param subModuleId 当前要处理的子模块对象的id号
     * @returns {*|___template___应该是一个promise对象|str|String}
     */
    var handleSub = function (sub, curModule, mod, subModuleId) {
        var data = (sub.filter === undefined) ?
            db.get(curModule) :
            $s.match(
                sub.filter,
                db.get(curModule)
            );

        return mod.render(data || {}).then(function (subModule) {
            ke('parse').fire('after', subModuleId, curModule, sub, mod, subModule);
            return subModule;
        });
    };
    /**
     * 预处理，为每个puzzle增加一个id号, 并转换成 ac标签，更加简短，另外可防止使用puzzle标签设置样式
     * @param confs
     * @param result
     * @returns {*}
     */
    var addId = function (confs, result) {
        confs.forEach(function (subConf) {
            subConf.id = '_ac_' + (+new Date()) + (asyncSubCount++);
            result = result.replace(
                subConf.puz,
                subConf.puz = '<ac id="' + subConf.id + '"></ac>' //更新puz属性，然后替换
            );
        });
        return result;
    };

    reduce.config({
        /**
         * 预处理当前模块的结果
         * @param result
         * @returns {*}
         */
        findSub: function (result) {
            return find.in(result);//此处不可编译阶段注入：htmlcode可能依赖运行时的数据动态生成
        },
        /**
         * @param syncConfs 当前运行的子模块的配置信息
         * @param result 本模块
         * @returns {*|XML|string|void} html代码
         */
        syncPre: function (syncConfs, result) {
            return addId(syncConfs, result);
        },
        /**
         * 处理同步的子模块
         * @param subConf  当前要处理的子模块 puzzle 配置
         * @param curMod 调用子模块的模块（当前渲染的模块） id 号
         * @param mod 当前要处理的子模块对象
         * @param subModuleId 当前要处理的子模块对象的id号
         * @returns {*|___template___应该是一个promise对象|str|String}
         */
        sync: function (subConf, curMod, mod, subModuleId) {
            return handleSub(subConf, curMod.id, mod, subModuleId)
                .then(function (reducedSub) {
                    //解析后的html代码，包裹到puzzle中
                    curMod.result = curMod.result.replace(subConf.puz, '<ac mid="' + subModuleId + '">' + reducedSub.html + '</ac>');
                    return reducedSub;
                })
        },
        /**
         * 预处理，为了提升选择器性能，给每一个puzzle id号
         * @param asyncConfs 当前运行的子模块的配置信息
         * @param result 本模块
         * @returns {*|XML|string|void} html代码
         */
        asyncPre: function (asyncConfs, result) {
            return addId(asyncConfs, result);
        },
        /**
         * 返回到前端的可使用的值
         * @param reducedResult
         * @returns {{html: *}}
         */
        resolveSyncWith: function (reducedResult) {
            return {html: reducedResult};
        },
        /**
         * 处理异步的子模块
         * @param subConf  当前要处理的子模块 puzzle 配置
         * @param curMod 调用子模块的模块（当前渲染的模块） id 号
         * @param mod 当前要处理的子模块对象
         * @param subModuleId 当前要处理的子模块对象的id号
         * @param errhandler 错误处理
         * @returns {*|___template___应该是一个promise对象|str|String}
         */
        async: function (subConf, curMod, mod, subModuleId, errhandler) {
            handleSub(subConf, curMod.id, mod, subModuleId)
                .then(function (asubModule) {
                    if ($('#' + subConf.id).size() > 0) {
                        $('#' + subConf.id).attr('mid', subModuleId);
                        $('#' + subConf.id).html(asubModule.html);
                        setImmediate(function () {//不阻塞渲染进程
                            if ($.isFunction(mod.init)) {
                                mod.init(curMod.id);
                            }
                            $('#' + subConf.id).removeAttr('id'); //去掉id号
                        });
                    }
                    return asubModule;
                })
                .then(function (asubModule) {
                    asubModule.done();
                }).fail(function (err) {
                    errhandler(err);
                });
        }
    });

    /**
     * 更新指定 puzzle 节点处的模块
     * @param node
     * @param data
     * @param Promise  resolve with 当前模块
     */
    exports.update = function (node, data) {
        var puzNode = $(node);
        var curModuleId = $(node).attr('mid');
        if (utils.isBrowser()) {
            if (!!define.amd) {
                requirejs.undef(curModuleId);
            }
        }
        requireMod(curModuleId, function (mod, subModuleId) {
            mod.render(data || {})
                .then(function (curMod) {
                    puzNode.html(curMod.html);
                    setImmediate(function () {//不阻塞渲染进程
                        if ($.isFunction(curMod.init)) {
                            curMod.init(curModuleId);
                        }
                    });
                    curMod.done();
                    return  curMod;
                });
        });
    };

    /**
     * 解析此模块依赖的子模块
     * @param fn jstm 产生的纯净的js模板方法
     * @param curModuleId 当前模块路径，此参数是为了加载模块依赖的子模块（子模块可能会使用相对路径）
     * @returns Function 为了不修改原模板生成代码的形式，采用这种方式，当调用后返回的是一个 Promise
     * Promise  resolve with
     * {
     *  html: htmlCode,  subModule 的html代码
     *  async: asyncReplaceBegin  异步模块开始加载的promise
     * }
     */
    exports.parse = function (fn, curModuleId) {
        return reduce.wrap(fn, curModuleId);
    };

    /**
     * 分析已有代码的模块依赖
     * @param code 已有 html 代码
     * @param curModuleId 当前html文件的路径
     * @param data 当前模块上下文数据
     * @returns {Function}
     */
    exports.inspect = function (code, curModuleId, data) {
        if (!!data) {
            db.add(curModuleId, data);
        }
        return reduce.start(code, curModuleId);
    };
    require('../../kkit').exp('parse', exports.parse);
});