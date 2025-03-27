sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, GeneralUtils, MessageBox, MessageToast) {
    "use strict";

    var _cref = {};
    var _v = {};
    var currNodeData = {};
    var __defaultSimilarity = 95;
    var _cfg = {};
    const DB_NAME = "VendorMasterDB";
    const STORE_NAME = "vendors";
    const DATA_KEY = "vendorData";

    return Controller.extend("com.victora.cmc.uix.controller.VendorListing", {
        onInit: function () {
            _cref = this;
            _v = this.getView();

            this._allSuspectData = [];

            _cfg.threshold = __defaultSimilarity;
            _cfg.groupCountText = "";
            _cfg.vendorCountText = "";
            _cfg.nationalVendorCnt = 0;
            _cfg.interNationalVendorCnt = 0;
            _cfg.totalVendorCnt = 0;
            _cfg.availableFilters = ["All", "National", "International"];

            _v.setModel(new JSONModel({ 
                selectedSuspects: [], 
                similarityThreshold: _cfg.threshold 
            }), "details");
            
            _v.setModel(new JSONModel(_cfg), "vcfg");
            
            this._loadVendorDataFromIndexedDB();
        },

        _loadVendorDataFromIndexedDB: function() {
            sap.ui.core.BusyIndicator.show(0);
            
            const request = indexedDB.open(DB_NAME, 1);
            
            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                MessageBox.error("Failed to access vendor database");
                sap.ui.core.BusyIndicator.hide();
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(DATA_KEY);
                
                request.onerror = (event) => {
                    console.error("Error loading data:", event.target.error);
                    MessageBox.error("Failed to load vendor data");
                    sap.ui.core.BusyIndicator.hide();
                };
                
                request.onsuccess = (event) => {
                    const storedData = event.target.result;
                    if (storedData && storedData.data) {
                        this.processVendorData(storedData.data.results || []);
                    } else {
                        MessageBox.error("No vendor data found in database");
                    }
                    sap.ui.core.BusyIndicator.hide();
                };
            };
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME, { keyPath: 'id' });
                }
            };
        },

        processVendorData: function (vendorData) {
            let countryMap = {};
            vendorData.forEach(e => {
                // Clean up StreetAdd, City, and District for display
                e.Name = e.Name.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                e.StreetAdd = e.StreetAdd.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ").toLowerCase();

                // Construct Address for display only (not for comparison)
                e.Address = [e.StreetAdd, e.City, e.District].filter(Boolean).join(", ").toLowerCase();

                // Group data by Country, TaxId, and Pincode/City
                if (!countryMap[e.Country]) countryMap[e.Country] = {};
                if (!countryMap[e.Country][e.TaxId]) countryMap[e.Country][e.TaxId] = {};
                let key = e.Pincode || e.City;
                if (!countryMap[e.Country][e.TaxId][key]) countryMap[e.Country][e.TaxId][key] = [];
                countryMap[e.Country][e.TaxId][key].push(e);
            });
            this.constructSuspectMap(countryMap);
        },

        constructSuspectMap: function (countryMap) {
            _cref._allSuspectData = Object.entries(countryMap).flatMap(([country, taxObj]) =>
                Object.entries(taxObj).flatMap(([tax, pincObj]) =>
                    Object.entries(pincObj).flatMap(([pincode, suspects]) =>
                        suspects.length > 1 ? {
                            key: `${country}_${tax}_${pincode}`,
                            country,
                            displayKey: `${country}_${tax}_${pincode} (${suspects.length})`,
                            suspects
                        } : []
                    )
                )
            );
            
            _cfg.groupCountText = "Groups: " + _cref._allSuspectData.length;
            _cref.processSuspectData();
            _cref.updateSuspectList("All");
        },

        processSuspectData: function () {
            var svals = Object.values(_cref._allSuspectData);
            for (let i = 0; i < svals.length; i++) {
                const elem = svals[i];
                if (elem.country == "IN") {
                    _cfg.nationalVendorCnt += elem.suspects.length;
                } else {
                    _cfg.interNationalVendorCnt += elem.suspects.length;
                }

                var suspects = JSON.parse(JSON.stringify(elem.suspects));
                suspects.sort((s1, s2) => (s1.StreetAdd.length > s2.StreetAdd.length) ? 1 : -1);
                let alternateSuspects = [];
                var similarityCtr = 0;

                while (suspects.length > 0) {
                    for (let i = 0; i < suspects.length; i++) {
                        const s = suspects[i];
                        if (i == 0) {
                            s.Duplicate = false;
                            similarityCtr++;
                            s.MatchGroup = "P_" + _cfg.threshold + "_" + similarityCtr;
                            alternateSuspects.push(s);
                        } else {
                            let similarity = GeneralUtils.calculateAddressSimilarity(suspects[0].StreetAdd, s.StreetAdd);
                            if (similarity >= _cfg.threshold) {
                                s.MatchGroup = "P_" + _cfg.threshold + "_" + similarityCtr;
                                s.Duplicate = true;
                                alternateSuspects.push(s);
                            }
                        }
                    }
                    suspects = suspects.filter(e => !alternateSuspects.some(s => s.VendorId === e.VendorId));
                }
                elem.suspects = alternateSuspects;
            }
            
            _cfg.totalVendorCnt = _cfg.nationalVendorCnt + _cfg.interNationalVendorCnt;
            _cfg.vendorCountText = "Vendors: " + _cfg.totalVendorCnt;
            _v.getModel("vcfg").refresh(true);
        },

        updateSuspectList: function (filterType) {
            let filteredData = this._allSuspectData.filter(item =>
                filterType === "National" ? item.country.startsWith("IN") :
                    filterType === "International" ? !item.country.startsWith("IN") : true
            );
            
            _cfg.groupCountText = "Groups: " + filteredData.length;
            _cfg.totalVendorCnt = filteredData.reduce((acc, item) => acc + item.suspects.length, 0);
            _cfg.vendorCountText = "Vendors: " + _cfg.totalVendorCnt;
            
            _v.getModel("vcfg").refresh(true);
            _v.setModel(new JSONModel({ 
                suspects: filteredData,
                selectedKey: null
            }), "cmc");
        },

        onSelectionChange: function (oEvent) {
            let sKey = oEvent.getParameter("listItem").getBindingContext("cmc").getProperty("key");
            _v.getModel("cmc").setProperty("/selectedKey", sKey);
            let suspectData = this._allSuspectData.find(item => item.key === sKey);
            sap.ui.core.BusyIndicator.show(0);
            currNodeData = suspectData;
            _cref.applySimilarityMatching();
            sap.ui.core.BusyIndicator.hide();
        },

        onFilterChange: function (oEvent) {
            let filterType = oEvent.getParameter("selectedItem").getKey();
            _v.getModel("vcfg").setProperty("/filterType", filterType);
            this.updateSuspectList(filterType);
        },

        handleVendorThresholdChange: function () {
            _cref.processSuspectData();
            _cref.applySimilarityMatching();
        },

        applySimilarityMatching: function () {
            sap.ui.core.BusyIndicator.show(0);
            if (currNodeData?.suspects) {
                _v.getModel("details").setProperty("/selectedSuspects", currNodeData.suspects);
            }
            sap.ui.core.BusyIndicator.hide();
            _v.getModel("vcfg").refresh(true);
        },

        refreshData: function() {
            sap.ui.core.BusyIndicator.show(0);
            this._allSuspectData = [];
            _cfg.nationalVendorCnt = 0;
            _cfg.interNationalVendorCnt = 0;
            this._loadVendorDataFromIndexedDB();
        },

        downloadAllVendors: function () {
            sap.ui.core.BusyIndicator.show(0);
            let allData = [];
            let filterType = _v.getModel("vcfg").getProperty("/filterType") || "All";
            
            this._allSuspectData.forEach(group => {
                if (filterType === "All" || 
                    (filterType === "National" && group.country.startsWith("IN")) ||
                    (filterType === "International" && !group.country.startsWith("IN"))) {
                    group.suspects.forEach(suspect => {
                        allData.push({
                            "Key": group.key,
                            "Country": group.country,
                            "Match Key": suspect.MatchGroup || "N/A",
                            "Address": suspect.Address,
                            "Vendor ID": suspect.VendorId,
                            "Name": suspect.Name,
                            "Tax ID": suspect.TaxId,
                            "Pincode": suspect.Pincode,
                            "Region": suspect.Region
                        });
                    });
                }
            });

            var filename = "Vendor_data-Export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Key", "Match Key", "Vendor ID", "Name", "Address", "Country", "Tax ID", "Pincode", "Region"]
            ];
            
            allData.forEach(item => {
                headerData.push([
                    item["Key"],
                    item["Match Key"],
                    item["Vendor ID"],
                    item["Name"],
                    item["Address"],
                    item["Country"],
                    item["Tax ID"],
                    item["Pincode"],
                    item["Region"]
                ]);
            });

            var wsh = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.book_append_sheet(wb, wsh, 'vendor-duplicates');
            XLSX.writeFile(wb, filename);
            sap.ui.core.BusyIndicator.hide();
            MessageToast.show(`Vendor data (${filterType}) has been exported to ${filename}`);
        },

        downloadGroupVendors: function () {
            sap.ui.core.BusyIndicator.show(0);
            let selectedKey = _v.getModel("cmc").getProperty("/selectedKey");

            if (!selectedKey) {
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("Please select a group to download.");
                return;
            }

            let selectedGroup = this._allSuspectData.find(group => group.key === selectedKey);

            if (!selectedGroup) {
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("No data found for the selected group.");
                return;
            }

            let groupData = [];
            selectedGroup.suspects.forEach(suspect => {
                groupData.push({
                    "Key": selectedGroup.key,
                    "Country": selectedGroup.country,
                    "Match Key": suspect.MatchGroup || "N/A",
                    "Address": suspect.Address,
                    "Vendor ID": suspect.VendorId,
                    "Name": suspect.Name,
                    "Tax ID": suspect.TaxId,
                    "Pincode": suspect.Pincode,
                    "Region": suspect.Region
                });
            });

            var filename = "vendor-group-export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Match Key", "Vendor ID", "Name", "Address", "Country", "Tax ID", "Pincode", "Region"]
            ];
            
            groupData.forEach(item => {
                headerData.push([
                    item["Match Key"],
                    item["Vendor ID"],
                    item["Name"],
                    item["Address"],
                    item["Country"],
                    item["Tax ID"],
                    item["Pincode"],
                    item["Region"]
                ]);
            });

            var wsh = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.book_append_sheet(wb, wsh, selectedKey);
            XLSX.writeFile(wb, filename);
            sap.ui.core.BusyIndicator.hide();
            MessageToast.show("Group data has been exported to " + filename);
        },

        onCustomerPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            sap.ui.core.BusyIndicator.show(0);
            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("CustomerListing");
            }, 1000);
        },

        onMaterialPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            sap.ui.core.BusyIndicator.show(0);
            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("MaterialListing");
            }, 1000);
        }
    });
});