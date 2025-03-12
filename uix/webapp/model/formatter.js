sap.ui.define([], function (JSONModel, Device) {
    "use strict";

    return {
        getProductListingBackgroundClass: function (status) {
            if(status == "Active"){
                return "bg-online";
            }else {
                return "bg-offline";
            }
        }
    };

});