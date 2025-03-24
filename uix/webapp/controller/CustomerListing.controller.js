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

    return Controller.extend("com.victora.cmc.uix.controller.CustomerListing", {
        onInit: function () {
            _cref = this;
            _v = this.getView();

            this._allSuspectData = [];

            _cfg.threshold = __defaultSimilarity;
            _cfg.groupCountText = "";
            _cfg.customerCountText = "";
            _cfg.nationalCustomerCnt = 0;
            _cfg.interNationalCustomerCnt = 0;
            _cfg.totalCustomerCnt = 0;

            _v.setModel(new JSONModel({ selectedSuspects: [], similarityThreshold: _cfg.threshold }), "details");
            _v.setModel(new JSONModel(_cfg), "vcfg")
            this.showCustomerListing();
        },

        showCustomerListing: async function () {
            try {
                let customerModel = new JSONModel();
                await customerModel.loadData("/model/victora_customer_master.json", false);
                let customerData = customerModel.getData();
                GeneralUtils.removeOdataResponseMetadata(customerData);
                this.processCustomerData(customerData.results || []);
            } catch (error) {
                MessageBox.error("Failed to load customer data.");
                console.error("Error loading customer data:", error);
            }
        },

        processCustomerData: function (customerData) {
            let countryMap = {};
            customerData.forEach(e => {
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
            _cfg.groupCountText = "Groups: " + Object.keys(_cref._allSuspectData).length;
            _cref.processSuspectData();
            _cref.updateSuspectList("All");
        },

        processSuspectData: function () {
            var svals = Object.values(_cref._allSuspectData);
            for (let i = 0; i < svals.length; i++) {
                const elem = svals[i];
                if (elem.country == "IN") {
                    _cfg.nationalCustomerCnt += elem.suspects.length;
                } else {
                    _cfg.interNationalCustomerCnt += elem.suspects.length;
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
                    suspects = suspects.filter(e => !alternateSuspects.some(s => s.CustomerId === e.CustomerId));
                }
                elem.suspects = alternateSuspects;
            }
        },

        updateSuspectList: function (filterType) {
            let filteredData = this._allSuspectData.filter(item =>
                filterType === "National" ? item.country.startsWith("IN") :
                    filterType === "International" ? !item.country.startsWith("IN") : true
            );
            _cfg.groupCountText = "Groups: " + Object.keys(filteredData).length
            if (filterType == "National") {
                _cfg.totalCustomerCnt = _cfg.nationalCustomerCnt;
                _cfg.customerCountText = "Customers: " + _cfg.totalCustomerCnt;
            } else if (filterType == "International") {
                _cfg.totalCustomerCnt = _cfg.interNationalCustomerCnt;
                _cfg.customerCountText = "Customers: " + _cfg.totalCustomerCnt;
            } else {
                _cfg.totalCustomerCnt = _cfg.nationalCustomerCnt + _cfg.interNationalCustomerCnt;
                _cfg.customerCountText = "Customers: " + _cfg.totalCustomerCnt;
            }
            _v.getModel("vcfg").refresh(true);
            _v.setModel(new JSONModel({ suspects: filteredData }), "cmc");
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
            _v.getModel("vcfg").setProperty("/filterType", filterType); // Store the filter type in the model
            this.updateSuspectList(filterType);
        },

        handleCustomerThresholdChange: function () {
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

        downloadAllCustomers: function () {
            // Show Busy Indicator
            sap.ui.core.BusyIndicator.show(0);

            // Simulate a delay for testing
            let allData = [];
            let filterType = _v.getModel("vcfg").getProperty("/filterType") || "All"; // Default to "All" if not set
            this._allSuspectData.forEach(group => {
                // Check if the group matches the current filter
                if (
                    filterType === "All" ||
                    (filterType === "National" && group.country.startsWith("IN")) ||
                    (filterType === "International" && !group.country.startsWith("IN"))
                ) {
                    group.suspects.forEach(suspect => {
                        let data = {
                            "Key": group.key,
                            "Country": group.country,
                            "Tax ID": suspect.TaxId,
                            "Pincode": suspect.Pincode,
                            "Match Group": suspect.MatchGroup || "N/A", // Use MatchGroup if available, otherwise "N/A"
                            "Address": suspect.Address,
                            "Customer ID": suspect.CustomerId,
                            "Name": suspect.Name,
                            "Region": suspect.Region
                        };
                        allData.push(data);
                    });
                }
            });

            // Define the filename
            var filename = "customer-duplicate-all-export.xlsx";

            // Create a new workbook
            var wb = XLSX.utils.book_new();

            // Define the header data
            var headerData = [
                ["Group Key", "Match Group", "Customer ID", "Name", "Address", "Country", "Tax ID", "Pincode", "Region"]
            ];

            allData.forEach(item => {
                headerData.push([
                    item["Key"],
                    item["Match Group"],
                    item["Customer ID"],
                    item["Name"],
                    item["Address"],
                    item["Country"],
                    item["Tax ID"],
                    item["Pincode"],
                    item["Region"]
                ]);
            });

            // Convert the headerData array to a worksheet
            var wsh = XLSX.utils.aoa_to_sheet(headerData);

            // Append the worksheet to the workbook
            XLSX.utils.book_append_sheet(wb, wsh, 'customerr-duplicates');

            // Export the workbook to an Excel file
            XLSX.writeFile(wb, filename);

            // Hide Busy Indicator after download is complete
            sap.ui.core.BusyIndicator.hide();

            MessageToast.show(`Customer data (${filterType}) has been exported to ${filename}`);
        },

        downloadGroupCustomers: function () {
            // Show Busy Indicator
            sap.ui.core.BusyIndicator.show(0);

            // Simulate a delay for testing
            // Get the selected key from the table (assuming it's stored in the model)
            let selectedKey = _v.getModel("cmc").getProperty("/selectedKey");

            if (!selectedKey) {
                // Hide Busy Indicator if no key is selected
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("Please select a group to download.");
                return;
            }

            // Find the group data for the selected key
            let selectedGroup = this._allSuspectData.find(group => group.key === selectedKey);

            if (!selectedGroup) {
                // Hide Busy Indicator if no group is found
                sap.ui.core.BusyIndicator.hide();
                MessageToast.show("No data found for the selected group.");
                return;
            }

            // Prepare the data for the selected group
            let groupData = [];
            selectedGroup.suspects.forEach(suspect => {
                let data = {
                    "Key": selectedGroup.key,
                    "Country": selectedGroup.country,
                    "Tax ID": suspect.TaxId,
                    "Pincode": suspect.Pincode,
                    "Match Group": suspect.MatchGroup || "N/A", // Use MatchGroup if available, otherwise "N/A"
                    "Address": suspect.Address,
                    "Customer ID": suspect.CustomerId,
                    "Name": suspect.Name,
                    "Region": suspect.Region
                };
                groupData.push(data);
            });

            // Define the filename
            var filename = "customer-duplicate-group-export.xlsx";

            // Create a new workbook
            var wb = XLSX.utils.book_new();

            // Define the header data
            var headerData = [
                ["Match Group", "Customer ID", "Name", "Address", "Country", "Tax ID", "Pincode", "Region"]
            ];

            // Add the data rows to the headerData array
            groupData.forEach(item => {
                headerData.push([
                    item["Match Group"],
                    item["Customer ID"],
                    item["Name"],
                    item["Address"],
                    item["Country"],
                    item["Tax ID"],
                    item["Pincode"],
                    item["Region"]
                ]);
            });

            // Convert the headerData array to a worksheet
            var wsh = XLSX.utils.aoa_to_sheet(headerData);

            // Append the worksheet to the workbook
            XLSX.utils.book_append_sheet(wb, wsh, selectedKey);

            // Export the workbook to an Excel file
            XLSX.writeFile(wb, filename);

            // Hide Busy Indicator after download is complete
            sap.ui.core.BusyIndicator.hide();

            MessageToast.show("Group data has been exported to " + filename);
        },

        
        onCustomerPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            var oView = this.getView();

            sap.ui.core.BusyIndicator.show(0);

            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("VendorListing");
            }, 1000);
        },

        onMeterialPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            var oView = this.getView();

            sap.ui.core.BusyIndicator.show(0);

            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("MeterialListing");
            }, 1000);
        }


    });
});