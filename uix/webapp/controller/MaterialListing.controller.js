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

    return Controller.extend("com.victora.cmc.uix.controller.MaterialListing", {
        onInit: function () {
            _cref = this;
            _v = this.getView();

            sap.ui.core.BusyIndicator.show(0);

            this._allSuspectData = [];
            this._typeGroupCounts = {}; // Store original type group counts
            this._currentFilteredCount = 0; // Store current filtered count

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

            this.showMaterialListing();
        },

        showMaterialListing: async function () {
            try {
                let materialModel = new JSONModel();
                sap.ui.core.BusyIndicator.show(0);

                await materialModel.loadData("/model/victora_material_master.json", false);
                let materialData = materialModel.getData();
                GeneralUtils.removeOdataResponseMetadata(materialData);

                this.processMaterialData(materialData.results || []);

                sap.ui.core.BusyIndicator.hide();
            } catch (error) {
                sap.ui.core.BusyIndicator.hide();
                MessageBox.error("Failed to load material data.");
                console.error("Error loading material data:", error);
            }
        },

        processMaterialData: function(materialData) {
            sap.ui.core.BusyIndicator.show(0);
            
            let materialMap = {};
            this._typeGroupCounts = {}; // Reset type group counts
            
            // Initialize counters
            let totalRecords = materialData.length;
            let blankDescriptionCount = 0;
            let hashDescriptionCount = 0;
            let validRecordsCount = 0;
        
            materialData.forEach(e => {
                // Check for blank description
                if (!e.Description || e.Description.trim().length === 0) {
                    blankDescriptionCount++;
                    return;
                }
                
                // Check for descriptions with only hash symbols (one or more)
                if (/^#+$/.test(e.Description.trim())) {
                    hashDescriptionCount++;
                    return;
                }
                
                // Check for very short descriptions
                if (e.Description.trim().length < 2) {
                    return;
                }
                
                validRecordsCount++;
                
                // Clean up Description for display
                e.Description = e.Description.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
            
                // Group data by Type and Description
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
        
            // Filter out types with 0 groups and create availableTypes array
            _cfg.availableTypes = [
                { type: "All", count: Object.values(this._typeGroupCounts).reduce((a, b) => a + b, 0) },
                ...Object.keys(this._typeGroupCounts)
                    .filter(type => this._typeGroupCounts[type] > 0) // Only include types with groups
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
                            "Match Key": suspect.MatchGroup || "N/A",
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
                let data = {
                    "Key": selectedGroup.key,
                    "Type": selectedGroup.type,
                    "Match Key": suspect.MatchGroup || "N/A",
                    "Description": suspect.Description,
                    "Material ID": suspect.Number,
                    "Name": suspect.Name
                };
                groupData.push(data);
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

            // Create a shortened sheet name (max 31 chars)
            var sheetName = selectedGroup.type + " Group";
            sheetName = sheetName.substring(0, 31); // Ensure it doesn't exceed 31 chars

            var wsh = XLSX.utils.aoa_to_sheet(headerData);
            XLSX.utils.book_append_sheet(wb, wsh, sheetName); // Use shortened name
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
            // Calculate current count (this will always be >0 due to prior filtering)
            const filteredCount = this._allSuspectData.filter(item => item.type === typeObj.type).length;
            return typeObj.type + " (" + filteredCount + ")";
        },
    });
});