sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/util/Storage"
], function (JSONModel, Storage) {
    "use strict";
    var _cref, _lstore;

    return {
        init() {
            _cref = this;
            _lstore = new Storage(Storage.Type.local, "remotedata");
        },
        initLocalStore() {
            return _lstore;
        },
        getLocalStore() {
            return _lstore;
        },
        removeOdataResponseMetadata(odata) {
            odata.results.map(function (el) {
                delete el.__metadata;
                return el;
            });
            return odata;
        },

    };
});