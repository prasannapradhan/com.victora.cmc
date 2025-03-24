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

    return Controller.extend("com.victora.cmc.uix.controller.MeterialListing", {
        onInit: function () {
            _cref = this;
            _v = this.getView();
            
            // Show loader immediately when controller initializes
            sap.ui.core.BusyIndicator.show(0);
            
            this._allSuspectData = [];

            _cfg.threshold = __defaultSimilarity;
            _cfg.groupCountText = "";
            _cfg.materialCountText = "";
            _cfg.totalMaterialCnt = 0;
            _cfg.availableTypes = ["All"]; // Initialize with "All" option

            _v.setModel(new JSONModel({ 
                selectedSuspects: [], 
                similarityThreshold: _cfg.threshold 
            }), "details");
            
            _v.setModel(new JSONModel(_cfg), "vcfg");
            
            // Show loader while loading data
            this.showMaterialListing();
        },

        showMaterialListing: async function () {
            try {
                let materialModel = new JSONModel();
                // Show loader before starting data load
                sap.ui.core.BusyIndicator.show(0);
                
                await materialModel.loadData("/model/victora_material_master.json", false);
                let materialData = materialModel.getData();
                GeneralUtils.removeOdataResponseMetadata(materialData);
                
                // Process data while loader is still showing
                this.processMaterialData(materialData.results || []);
                
                // Hide loader after processing is complete
                sap.ui.core.BusyIndicator.hide();
            } catch (error) {
                // Hide loader if there's an error
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to load material data.");
                console.error("Error loading material data:", error);
            }
        },

        processMaterialData: function (materialData) {
            // Show loader while processing data
            sap.ui.core.BusyIndicator.show(0);
            
            let materialMap = {};
            let uniqueTypes = new Set();

            materialData.forEach(e => {
                // Skip if description is blank or less than 2 characters
                if (!e.Description || e.Description.trim().length < 2) {
                    return;
                }
                
                // Add type to unique types set
                if (e.Type) {
                    uniqueTypes.add(e.Type);
                }
                
                // Clean up Description for display
                e.Description = e.Description.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
        
                // Group data by Type and Description
                if (!materialMap[e.Type]) materialMap[e.Type] = {};
                if (!materialMap[e.Type][e.Description]) materialMap[e.Type][e.Description] = [];
                materialMap[e.Type][e.Description].push(e);
            });

            // Convert Set to array and sort alphabetically
            _cfg.availableTypes = ["All", ...Array.from(uniqueTypes).sort()];
            console.log("All available material types:", _cfg.availableTypes.slice(1)); // Exclude "All" from console log
            
            // Update available types in the model
            _v.getModel("vcfg").setProperty("/availableTypes", _cfg.availableTypes);
            _v.getModel("vcfg").refresh(true);
            
            this.constructSuspectMap(materialMap);
        },

        constructSuspectMap: function (materialMap) {
            _cref._allSuspectData = Object.entries(materialMap).flatMap(([type, descObj]) =>
                Object.entries(descObj).flatMap(([description, suspects]) =>
                    suspects.length > 1 ? {
                        key: `${type}_${description}`,
                        type,
                        displayKey: `${type}_${description} (${suspects.length})`,
                        suspects
                    } : []
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
            
            _cfg.groupCountText = "Groups: " + filteredData.length;
            _cfg.totalMaterialCnt = filteredData.reduce((acc, item) => acc + item.suspects.length, 0);
            _cfg.materialCountText = "Materials: " + _cfg.totalMaterialCnt;
            
            _v.getModel("vcfg").refresh(true);
            _v.setModel(new JSONModel({ 
                suspects: filteredData,
                selectedKey: null // Reset selection when filtering
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

        handleMaterialThresholdChange: function () {
            _cref.processSuspectData();
            _cref.applySimilarityMatching();
        },

        applySimilarityMatching: function () {
            sap.ui.core.BusyIndicator.show(0);
            if (typeof currNodeData != "undefined" && (typeof currNodeData.suspects != "undefined")) {
                var suspects = currNodeData.suspects;
                _v.getModel("details").setProperty("/selectedSuspects", suspects);
                sap.ui.core.BusyIndicator.hide();
            }
            sap.ui.core.BusyIndicator.hide();
            _v.getModel("vcfg").refresh(true);
        },

        downloadAllMaterials: function () {
            sap.ui.core.BusyIndicator.show(0);
            let allData = [];
            let filterType = _v.getModel("vcfg").getProperty("/filterType") || "All";
            this._allSuspectData.forEach(group => {
                if (filterType === "All" || group.type === filterType) {
                    group.suspects.forEach(suspect => {
                        let data = {
                            "Key": group.key,
                            "Type": group.type,
                            "Match (%)": suspect.MatchGroup || "N/A",
                            "Description": suspect.Description,
                            "Material ID": suspect.Number,
                            "Name": suspect.Name
                        };
                        allData.push(data);
                    });
                }
            });

            var filename = "Material_data-Export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Key", "Match (%)", "Material ID", "Description", "Type"]
            ];
            allData.forEach(item => {
                headerData.push([
                    item["Key"],
                    item["Match (%)"],
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
                let data = {
                    "Key": selectedGroup.key,
                    "Type": selectedGroup.type,
                    "Match (%)": suspect.MatchGroup || "N/A",
                    "Description": suspect.Description,
                    "Material ID": suspect.Number,
                    "Name": suspect.Name
                };
                groupData.push(data);
            });

            var filename = "material-duplicate-group-export.xlsx";
            var wb = XLSX.utils.book_new();
            var headerData = [
                ["Match (%)", "Material ID", "Description", "Type"]
            ];
            groupData.forEach(item => {
                headerData.push([
                    item["Match (%)"],
                    item["Material ID"],
                    item["Description"],
                    item["Type"]
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
        onVendorPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            sap.ui.core.BusyIndicator.show(0);
            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("VendorListing");
            }, 1000);
        },
    });
});