sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils",
    "sap/m/MessageBox",
    "sap/m/MessageToast",
    "sap/ui/core/Item"
], function (Controller, JSONModel, GeneralUtils, MessageBox, MessageToast, Item) {
    "use strict";

    var _cref = {};
    var _v = {};
    var currNodeData = {};
    var __defaultSimilarity = 95;
    var _cfg = {};
    const DB_NAME = "MaterialMasterDB";
    const STORE_NAME = "materials";
    const DATA_KEY = "materialData";

    return Controller.extend("com.victora.cmc.uix.controller.MaterialListing", {
        onInit: function () {
            _cref = this;
            _v = this.getView();

            this._allSuspectData = [];
            this._typeGroupCounts = {};
            this._currentFilteredCount = 0;

            _cfg.threshold = __defaultSimilarity;
            _cfg.groupCountText = "";
            _cfg.materialCountText = "";
            _cfg.totalMaterialCnt = 0;
            _cfg.availableTypes = ["All"];

            _v.setModel(new JSONModel({
                selectedSuspects: [],
                similarityThreshold: _cfg.threshold
            }), "details");

            _v.setModel(new JSONModel(_cfg), "vcfg");

            this._loadMaterialDataFromIndexedDB();
        },

        _loadMaterialDataFromIndexedDB: function() {
            sap.ui.core.BusyIndicator.show(0);
            
            const request = indexedDB.open(DB_NAME, 1);
            
            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                MessageBox.error("Failed to access material database");
                sap.ui.core.BusyIndicator.hide();
            };
            
            request.onsuccess = (event) => {
                const db = event.target.result;
                const transaction = db.transaction([STORE_NAME], 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get(DATA_KEY);
                
                request.onerror = (event) => {
                    console.error("Error loading data:", event.target.error);
                    MessageBox.error("Failed to load material data");
                    sap.ui.core.BusyIndicator.hide();
                };
                
                request.onsuccess = (event) => {
                    const storedData = event.target.result;
                    if (storedData && storedData.data) {
                        this.processMaterialData(storedData.data.results || []);
                    } else {
                        MessageBox.error("No material data found in database");
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

        processMaterialData: function(materialData) {
            let materialMap = {};
            this._typeGroupCounts = {};
            
            let totalRecords = materialData.length;
            let blankDescriptionCount = 0;
            let hashDescriptionCount = 0;
            let validRecordsCount = 0;
        
            materialData.forEach(e => {
                if (!e.Description || e.Description.trim().length === 0) {
                    blankDescriptionCount++;
                    return;
                }
                
                if (/^#+$/.test(e.Description.trim())) {
                    hashDescriptionCount++;
                    return;
                }
                
                if (e.Description.trim().length < 2) {
                    return;
                }
                
                validRecordsCount++;
                e.Description = e.Description.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
            
                if (!materialMap[e.Type]) {
                    materialMap[e.Type] = {};
                    this._typeGroupCounts[e.Type] = 0;
                }
                if (!materialMap[e.Type][e.Description]) {
                    materialMap[e.Type][e.Description] = [];
                    this._typeGroupCounts[e.Type]++;
                }
                materialMap[e.Type][e.Description].push(e);
            });
        
            _cfg.availableTypes = [
                { type: "All", count: Object.values(this._typeGroupCounts).reduce((a, b) => a + b, 0) },
                ...Object.keys(this._typeGroupCounts)
                    .filter(type => this._typeGroupCounts[type] > 0)
                    .sort()
                    .map(type => ({
                        type: type,
                        count: this._typeGroupCounts[type]
                    }))
            ];
            
            _v.getModel("vcfg").setProperty("/availableTypes", _cfg.availableTypes);
            _v.getModel("vcfg").refresh(true);
            
            this.constructSuspectMap(materialMap);
        },

        constructSuspectMap: function (materialMap) {
            this._allSuspectData = Object.entries(materialMap).flatMap(([type, descObj]) =>
                Object.entries(descObj).flatMap(([description, suspects]) =>
                    suspects.length > 1 ? {
                        key: `${type}_${description}`,
                        type,
                        displayKey: `${description} (${suspects.length})`,
                        suspects
                    } : []
                )
            );

            this._currentFilteredCount = this._allSuspectData.length;
            _cfg.groupCountText = "Groups: " + this._allSuspectData.length;
            this.processSuspectData();
            this.updateSuspectList("All");
        },

        processSuspectData: function () {
            var svals = Object.values(this._allSuspectData);
            for (let i = 0; i < svals.length; i++) {
                const elem = svals[i];
                _cfg.totalMaterialCnt += elem.suspects.length;

                var suspects = JSON.parse(JSON.stringify(elem.suspects));
                suspects.sort((s1, s2) => (s1.Description.length > s2.Description.length) ? 1 : -1);
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
                            let similarity = GeneralUtils.calculateAddressSimilarity(suspects[0].Description, s.Description);
                            if (similarity >= _cfg.threshold) {
                                s.MatchGroup = "P_" + _cfg.threshold + "_" + similarityCtr;
                                s.Duplicate = true;
                                alternateSuspects.push(s);
                            }
                        }
                    }
                    suspects = suspects.filter(e => !alternateSuspects.some(s => s.Number === e.Number));
                }
                elem.suspects = alternateSuspects;
            }
        },

        updateSuspectList: function (filterType) {
            let filteredData = this._allSuspectData;

            if (filterType !== "All") {
                filteredData = filteredData.filter(item => item.type === filterType);
            }

            this._currentFilteredCount = filteredData.length;
            _cfg.groupCountText = "Groups: " + filteredData.length;
            _cfg.totalMaterialCnt = filteredData.reduce((acc, item) => acc + item.suspects.length, 0);
            _cfg.materialCountText = "Materials: " + _cfg.totalMaterialCnt;

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
            this.applySimilarityMatching();
            sap.ui.core.BusyIndicator.hide();
        },

        onFilterChange: function (oEvent) {
            let filterType = oEvent.getParameter("selectedItem").getKey();
            _v.getModel("vcfg").setProperty("/filterType", filterType);
            this.updateSuspectList(filterType);
        },

        handleMaterialThresholdChange: function () {
            this.processSuspectData();
            this.applySimilarityMatching();
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
            _cfg.totalMaterialCnt = 0;
            this._loadMaterialDataFromIndexedDB();
        },

        downloadAllMaterials: function () {
            sap.ui.core.BusyIndicator.show(0);
            let allData = [];
            let filterType = _v.getModel("vcfg").getProperty("/filterType") || "All";
            
            this._allSuspectData.forEach(group => {
                if (filterType === "All" || group.type === filterType) {
                    group.suspects.forEach(suspect => {
                        allData.push({
                            "Key": group.key,
                            "Type": group.type,
                            "Match Key": suspect.MatchGroup || "N/A",
                            "Description": suspect.Description,
                            "Material ID": suspect.Number,
                            "Name": suspect.Name
                        });
                    });
                }
            });

            var filename = "Material_data-Export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Key", "Match Key", "Material ID", "Description", "Type"]
            ];
            
            allData.forEach(item => {
                headerData.push([
                    item["Key"],
                    item["Match Key"],
                    item["Material ID"],
                    item["Description"],
                    item["Type"]
                ]);
            });

            var wsh = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.book_append_sheet(wb, wsh, 'material-duplicates');
            XLSX.writeFile(wb, filename);
            sap.ui.core.BusyIndicator.hide();
            MessageToast.show(`Material data (${filterType}) has been exported to ${filename}`);
        },

        downloadGroupMaterials: function () {
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
                    "Type": selectedGroup.type,
                    "Match Key": suspect.MatchGroup || "N/A",
                    "Description": suspect.Description,
                    "Material ID": suspect.Number,
                    "Name": suspect.Name
                });
            });

            var filename = "material-group-export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Match Key", "Material ID", "Description", "Type"]
            ];
            
            groupData.forEach(item => {
                headerData.push([
                    item["Match Key"],
                    item["Material ID"],
                    item["Description"],
                    item["Type"]
                ]);
            });

            var sheetName = selectedGroup.type + " Group";
            sheetName = sheetName.substring(0, 31);

            var wsh = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.book_append_sheet(wb, wsh, sheetName);
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

        onVendorPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            sap.ui.core.BusyIndicator.show(0);
            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("VendorListing");
            }, 1000);
        },

        formatTypeText: function (typeObj) {
            if (typeObj.type === "All") {
                return "All (" + this._allSuspectData.length + ")";
            }
            const filteredCount = this._allSuspectData.filter(item => item.type === typeObj.type).length;
            return typeObj.type + " (" + filteredCount + ")";
        }
    });
});