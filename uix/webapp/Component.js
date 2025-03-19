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
        var _cref = {};

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
                _cref = this;
                // call the base component's init function
                UIComponent.prototype.init.apply(this, arguments);
                // set the device model
                this.setModel(models.createDeviceModel(), "device");
                console.log("Initialized device model");

                // enable routing
                this.getRouter().initialize();
                console.log("Initialized Router");

                var jszip = document.createElement('script');
                jszip.setAttribute('src',
                    'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.10.0/jszip.js');
                document.head.appendChild(jszip);
                jszip.onload = function () {
                    var xlsx = document.createElement('script');
                    xlsx.setAttribute('src',
                        'https://unpkg.com/xlsx/dist/xlsx.full.min.js');
                    document.head.appendChild(xlsx);

                    _cref.getRouter().navTo("CustomerListing");
                    console.log("Routed to main view");
                }
            }
        });
    }
);