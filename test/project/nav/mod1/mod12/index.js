if (typeof define !== 'function') {
    var define = require('amdefine')(module)
}

define(function (require, exports, module) {
    var subModule = require("../../../../../lib/runtime/subModule/index");
    module.exports = {
        init: function () {
            return "It's nav/mod1/mod12 !!";
        },
        render: function (data) {
            return ___template___(data);
        }
    };
});