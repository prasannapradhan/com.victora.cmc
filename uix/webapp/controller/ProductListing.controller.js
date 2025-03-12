sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils"
],
    function (Controller, JSONModel, __gu) {
        "use strict";
        var _c, _v;
        var _lstore, busyDialog;

        return Controller.extend("com.victora.cmc.uix.controller.ProductListing", {
            onInit: function () {
                _c = this;
                _v = _c.getView();
                _lstore = __gu.getLocalStore();
                _c.showProductListing();
                busyDialog = new sap.m.BusyDialog({ text: "Please Wait" });
            },
            showProductCreate: function (e) {
                var product = {
                    "Name": "New Product",
                    "Description": "Default Description",
                    "Guid": Date.now(),
                    "Status": "Offline" // Offline, Active, Deleted
                };
                _v.setModel(new JSONModel(product), "product");

                _v.byId("productListingPage").setVisible(false);
                _v.byId("productCreatePage").setVisible(true);
            },
            showProductListing: function (e) {
                _v.byId("productCreatePage").setVisible(false);
                _v.byId("productListingPage").setVisible(true);
                __gu.loadProductsLocal(function (products) {
                    var productsModel = new JSONModel(products);
                    _v.setModel(productsModel, "productsModel");
                });
            },
            saveNewProduct: function (e) {
                var productModel = _v.getModel("product");
                var newProduct = productModel.getData();
                __gu.addProductToLocal(newProduct);
                _c.showProductListing();
            },
            reloadProducts: function (e) {
                __gu.cleanLocalProducts();
                _c.showBusy();
                __gu.loadProductsService(_c, function (serviceProducts) {
                    __gu.updateProductsToLocal(serviceProducts);
                    var productsModel = new JSONModel(serviceProducts);
                    _v.setModel(productsModel, "productsModel");
                    _c.hideBusy();
                })
            },
            syncProducts: function (e) {
                _c.showBusy();
                // TODO handle the offline to online sync here.
                __gu.loadProductsLocal(function (products) {
                    var offlineProducts = [];
                    for (let i = 0; i < products.length; i++) {
                        const product = products[i];
                        if (product.Status == "Offline") {
                            offlineProducts.push(product);
                        }
                    }
                    if (offlineProducts.length > 0) {
                        console.log("Offline products [" + JSON.stringify(offlineProducts) + "]")
                        __gu.saveProductsService(_c, offlineProducts, function (status) {
                            if (status == "success") {
                                __gu.loadProductsService(_c, function (serviceProducts) {
                                    __gu.updateProductsToLocal(serviceProducts);
                                    var productsModel = new JSONModel(serviceProducts);
                                    _v.setModel(productsModel, "productsModel");
                                    _c.hideBusy();
                                })
                            } else {
                                __gu.loadProductsService(_c, function (serviceProducts) {
                                    serviceProducts.push.apply(offlineProducts);
                                    __gu.updateProductsToLocal(serviceProducts);
                                    var productsModel = new JSONModel(products);
                                    _v.setModel(productsModel, "productsModel");
                                    _c.hideBusy();
                                })
                            }
                        });
                    } else {
                        _c.hideBusy();
                    }
                });

            },
            handleProductDelete(e) {
                var model = e.getParameter("listItem").getBindingContext("productsModel");
                var item = model.getObject(model.sPath);
                if (item.Status == "Offline") {
                    __gu.deleteProductLocal(item, function (products) {
                        var productsModel = new JSONModel(products);
                        _v.setModel(productsModel, "productsModel");
                    });
                } else {
                    _c.showBusy();
                    __gu.deleteProductLocal(item, function (products) {
                        var productsModel = new JSONModel(products);
                        _v.setModel(productsModel, "productsModel");
                        __gu.deleteProductService(_c, item, function (status) {
                            _c.hideBusy();
                        });
                    });
                }
            },
            showBusy: function () {
                busyDialog.open();
            },
            hideBusy: function () {
                busyDialog.close();
            },

        });
    });
