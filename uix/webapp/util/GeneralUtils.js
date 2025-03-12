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
            var productsJSON = _lstore.get("products");
            if (typeof productsJSON == "undefined" || productsJSON == null) {
                console.log("Resetting the local storage with products");
                _lstore.put("products", JSON.stringify([]));
            } else {
                console.log("Products already exist in local. Ignoring reset");
            }
            return _lstore;
        },
        cleanLocalProducts() {
            _lstore.put("products", JSON.stringify([]));
        },
        getLocalStore() {
            return _lstore;
        },
        loadProductsService(controller, callback) {
            var oc = controller.getOwnerComponent();
            var psm = oc.getModel("ProductServiceModel");
            psm.read("/ZPK_PRODUCTSet", {
                success: function (odata, oResponse) {
                    _cref.removeOdataResponseMetadata(odata);
                    callback(odata.results);
                },
                error: function (err) {
                    console.log("Error in fetching products from backend");
                    console.log(err);
                }
            });
        },
        loadProductsLocal(callback) {
            var productsJSON = _lstore.get("products");
            if (typeof productsJSON == "undefined" || productsJSON == null) {
                _cref.initLocalStore();
                productsJSON = JSON.stringify([]);
            }
            callback(JSON.parse(productsJSON));
        },
        deleteProductLocal(item, callback){
            var productsJSON = _lstore.get("products");
            if (typeof productsJSON == "undefined" || productsJSON == null) {
                _cref.initLocalStore();
                productsJSON = JSON.stringify([]);
            }
            var localProducts = JSON.parse(productsJSON);
            var idx = -1;
            for (let i = 0; i < localProducts.length; i++) {
                const lp = localProducts[i];
                if(lp.Guid == item.Guid){
                    idx = i;
                }
            }
            if(idx != -1){
                localProducts.splice(idx, 1);
            }
            _lstore.put("products", JSON.stringify(localProducts));
            callback(localProducts);
        },
        addProductToLocal(product) {
            var productsJSON = _lstore.get("products");
            if (typeof productsJSON == "undefined" || productsJSON == null) {
                _cref.initLocalStore();
                productsJSON = JSON.stringify([]);
            }
            var localProducts = JSON.parse(productsJSON);
            localProducts.push(product);
            _lstore.put("products", JSON.stringify(localProducts));
        },
        addProductsToLocal(products) {
            var productsJSON = _lstore.get("products");
            if (typeof productsJSON == "undefined" || productsJSON == null) {
                _cref.initLocalStore();
                productsJSON = JSON.stringify([]);
            }
            var localProducts = JSON.parse(productsJSON);
            localProducts.push.apply(products);
            _lstore.put("products", JSON.stringify(localProducts));
        },
        updateProductsToLocal(products) {
            _lstore.put("products", JSON.stringify(products));
        },
        async saveProductsService(controller, offlineProducts, callback) {
            var oc = controller.getOwnerComponent();
            var psm = oc.getModel("ProductServiceModel");
            var surl = psm.sServiceUrl;
            for (let i = 0; i < offlineProducts.length; i++) {
                const op = offlineProducts[i];
                if(op.Status == "Offline"){
                    const opx = JSON.parse(JSON.stringify(op));
                    opx.Status = "Active";
                    await _cref.doSaveProduct(surl, opx);    
                }
            }
            callback("success");
        },
        async deleteProductService(controller, product, callback) {
            var oc = controller.getOwnerComponent();
            var psm = oc.getModel("ProductServiceModel");
            await _cref.doDeleteProduct(psm.sServiceUrl, product); 
            callback("success");
        },
        doSaveProduct(surl , product){
            var createModel = new sap.ui.model.odata.ODataModel(surl, true);
            var px = JSON.parse(JSON.stringify(product));
            px.Guid = "";
            px.Status = "Active";
            createModel.create('/ZPK_PRODUCTSet', px, null, 
            function (suc, resp) {
                console.log("Success in saving product");
                console.log(suc);
                console.log(resp);
            }, 
            function (err) {
                console.log("Failed to save product");
                console.log(err);
            });
        },
        doDeleteProduct(surl , product){
            var createModel = new sap.ui.model.odata.ODataModel(surl, true);
            var spath = "/ZPK_PRODUCTSet('" + product.Guid +"')";
            console.log(spath);
            createModel.remove(spath, null, 
            function (resp) {
                console.log("Success in deleting product");
                console.log(resp);
            }, 
            function (err) {
                console.log("Failed to delete product");
                console.log(err);
            });
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