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
                busyDialog = new sap.m.BusyDialog({ text: "Please Wait" });
                _c.showBusy();
                _c.showcustomerListing();
                _c.hideBusy();
            },
            showcustomerListing: async function (e) {
                console.log("Show customer listing..");
                var cmm = new JSONModel();
                await cmm.loadData("model/victora_customer_master.json", false);
                var cmdata = cmm.getData();
                __gu.removeOdataResponseMetadata(cmdata);
                cmdata = cmdata.results;

                var countryMap = {};
                for (let i = 0; i < cmdata.length; i++) {
                    const e = cmdata[i];
                    e.Name = e.Name.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                    e.StreetAdd = e.StreetAdd.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                    e.Address = e.StreetAdd;
                    if (e.City != "") {
                        if (e.Address.indexOf(e.City) == -1) {
                            e.Address += ' ' + e.City;
                        }
                    }
                    e.Address = e.Address.toLowerCase();
                    if (e.District != "") {
                        if (e.Address.indexOf(e.District) == -1) {
                            e.Address += ' ' + e.District;
                        }
                    }
                    if (typeof countryMap[e.Country] == "undefined") {
                        countryMap[e.Country] = {};
                    }
                    var taxMap = countryMap[e.Country];
                    if (typeof taxMap[e.TaxId] == "undefined") {
                        taxMap[e.TaxId] = {};
                    }
                    var pincMap = taxMap[e.TaxId];
                    if (e.Pincode != "") {
                        if (typeof pincMap[e.Pincode] == "undefined") {
                            pincMap[e.Pincode] = [];
                        }
                        var suspects = pincMap[e.Pincode];
                        suspects.push(e);
                    } else {
                        if (typeof pincMap[e.City] == "undefined") {
                            pincMap[e.City] = [];
                        }
                        var suspects = pincMap[e.City];
                        suspects.push(e);
                    }
                }
                var suspectMap = {};
                for (var cprop in countryMap) {
                    if (typeof countryMap[cprop] != "undefined") {
                        var tobj = countryMap[cprop];
                        for (var tprop in tobj) {
                            if (typeof tobj[tprop] != "undefined") {
                                var pobj = tobj[tprop];
                                for (var pprop in pobj) {
                                    if (typeof pobj[pprop] != "undefined") {
                                        var suspects = pobj[pprop];
                                        if (suspects.length > 1) {
                                            var skey = cprop + "_" + tprop + "_" + pprop;
                                            suspectMap[skey] = suspects;
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
                console.log(suspectMap);

                var suspectArray = Object.keys(suspectMap).map(key => ({
                    key: key, // Keep only the key
                    displayKey: `${key} (${suspectMap[key].length})`, // Show count in brackets
                    suspects: suspectMap[key]
                }));

                var cmcModel = new JSONModel({ suspects: suspectArray });
                _v.setModel(cmcModel, "cmc");
                _v.setModel(new JSONModel(), "details");
            },

            onSelectionChange: function (oEvent) {
                var selectedItem = oEvent.getParameter("listItem");
                var sKey = selectedItem.getBindingContext("cmc").getProperty("key"); // Extract actual key
                var oModel = _v.getModel("cmc");
                var aSuspects = oModel.getProperty("/suspects");

                var suspectData = aSuspects.find(item => item.key === sKey);
                if (suspectData && suspectData.suspects.length > 0) {
                    var suspectDetails = suspectData.suspects.map(suspect => ({
                        Name: suspect.Name,
                        CustomerId: suspect.CustomerId,
                        Address: suspect.Address,
                        Region: suspect.Region,
                        Country: suspect.Country
                    }));

                    // Set the selected suspects to the details model
                    var detailsModel = _v.getModel("details");
                    detailsModel.setProperty("/selectedSuspects", suspectDetails);
                } else {
                    // If no data, reset the table
                    var detailsModel = _v.getModel("details");
                    detailsModel.setProperty("/selectedSuspects", []);
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
