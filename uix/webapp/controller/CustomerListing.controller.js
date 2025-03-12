sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils"
],
    function (Controller, JSONModel, __gu) {
        "use strict";
        var _c, _v;
        var busyDialog;

        return Controller.extend("com.victora.cmc.uix.controller.CustomerListing", {
            onInit: function () {
                _c = this;
                _v = _c.getView();
                _c.showcustomerListing();
                busyDialog = new sap.m.BusyDialog({ text: "Please Wait" });
            },
            showcustomerListing: async function (e) {
                console.log("Show customer listing..");
                var oMydata = new JSONModel();
                await oMydata.loadData("/model/victora_customer_master.json", false);
                console.log(JSON.stringify(oMydata.getData()));
            },
            showBusy: function () {
                busyDialog.open();
            },
            hideBusy: function () {
                busyDialog.close();
            },

        });
    });
