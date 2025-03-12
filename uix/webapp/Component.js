/**
 * eslint-disable @sap/ui5-jsdocs/no-jsdoc
 */

sap.ui.define([
        "sap/ui/core/UIComponent",
        "com/victora/cmc/uix/model/models",
        "com/victora/cmc/uix/util/GeneralUtils"
    ],
    function (UIComponent, models, __gu) {
        "use strict";

        return UIComponent.extend("com.victora.cmc.uix.Component", {
            metadata: {
                interfaces: ["sap.ui.core.IAsyncContentCreation"],
                manifest: "json"
            },
    
            /**
             * The component is initialized by UI5 automatically during the startup of the app and calls the init method once.
             * @public
             * @override
             */
            init: function () {
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);
                // set the device model
                this.setModel(models.createDeviceModel(), "device");
                console.log("Initialized device model");

                try {
                    __gu.init();
                    __gu.initLocalStore();
                } catch (error) {
                    console.log("Error initializing General Utils");
                    console.error(error);
                }
                console.log("Initialized General utils");

                // enable routing
                this.getRouter().initialize();
                console.log("Initialized Router");

                this.getRouter().navTo("ProductListing");
                console.log("Routed to main view");
            }
        });
    }
);