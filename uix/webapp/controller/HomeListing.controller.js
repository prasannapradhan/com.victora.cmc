sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageToast) {
    "use strict";

    return Controller.extend("sap.ui.demo.controller.Home", {
        onInit: function () {
            this._loadModels();
        },

        _loadModels: function () {
            var oView = this.getView();
            var oBusyIndicator = oView.byId("busyIndicator");

            var oVendorModel = new JSONModel();
            var oMaterialModel = new JSONModel();
            var oCustomerModel = new JSONModel();

            var oVendorPromise = oVendorModel.loadData("model/victora_vendor_master.json");
            var oMaterialPromise = oMaterialModel.loadData("model/victora_material_master.json");
            var oCustomerPromise = oCustomerModel.loadData("model/victora_customer_master.json");

            Promise.all([oVendorPromise, oMaterialPromise, oCustomerPromise]).then(() => {
                sap.ui.getCore().setModel(oVendorModel, "vendors");
                sap.ui.getCore().setModel(oMaterialModel, "materials");
                sap.ui.getCore().setModel(oCustomerModel, "customers");

                oBusyIndicator.setVisible(false);

                var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.navTo("CustomerListing");
            }).catch(() => {
                MessageToast.show("Failed to load data. Please try again.");
            });
        }
    });
});
