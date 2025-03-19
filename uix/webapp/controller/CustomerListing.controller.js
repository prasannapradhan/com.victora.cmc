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
                            let similarity = _cref.calculateAddressSimilarity(suspects[0].StreetAdd, s.StreetAdd);
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
            _cref.updateSuspectList("All");
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

        calculateLevenshteinDistance: function (str1, str2) {
            let [m, n] = [str1.length, str2.length], dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));
            for (let i = 0; i <= m; i++) dp[i][0] = i;
            for (let j = 0; j <= n; j++) dp[0][j] = j;
            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    dp[i][j] = str1[i - 1] === str2[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
            return dp[m][n];
        },

        calculateAddressSimilarity: function (addr1, addr2) {
            if (!addr1 || !addr2) return 0;

            // Ensure addr1 is always the shorter string
            if (addr1.length > addr2.length) {
                [addr1, addr2] = [addr2, addr1]; // Swap to maintain order
            }
            // Check if the shorter address is a substring of the longer address
            if (addr2.includes(addr1)) {
                return 100; // Exact substring match
            }
            let tokens1 = addr1.split(/\s+/);
            let tokens2 = addr2.split(/\s+/);

            let allTokensMatch = tokens1.every(token => tokens2.includes(token));
            if (allTokensMatch) {
                return 100; // All tokens of the shorter address are present in the longer address
            }
            // Calculate Levenshtein distance for partial matches
            let maxLength = addr2.length;
            let distance = this.calculateLevenshteinDistance(addr1, addr2);
            let similarityScore = ((maxLength - distance) / maxLength) * 100;

            return similarityScore.toFixed(2);
        },

        onSelectionChange: function (oEvent) {
            let sKey = oEvent.getParameter("listItem").getBindingContext("cmc").getProperty("key");
            _v.getModel("cmc").setProperty("/selectedKey", sKey);
            let suspectData = this._allSuspectData.find(item => item.key === sKey);
            sap.ui.core.BusyIndicator.show(0);
            currNodeData = suspectData;
            _cref.applySimilarityMatching(_cfg.threshold);
            sap.ui.core.BusyIndicator.hide();
        },

        onFilterChange: function (oEvent) {
            let filterType = oEvent.getParameter("selectedItem").getKey();
            _v.getModel("vcfg").setProperty("/filterType", filterType); // Store the filter type in the model
            this.updateSuspectList(filterType);
        },

        handleCustomerThresholdChange: function () {
            this.applySimilarityMatching(parseInt(_cfg.threshold));
        },

        applySimilarityMatching: function (similarityThreshold, group) {
            sap.ui.core.BusyIndicator.show(0);
            var opsData = group || currNodeData;
            if (typeof opsData != "undefined" && (typeof opsData.suspects != "undefined")) {
                var suspects = opsData.suspects;
                _v.getModel("details").setProperty("/selectedSuspects", suspects);
                sap.ui.core.BusyIndicator.hide();
            }
            sap.ui.core.BusyIndicator.hide();
            _v.getModel("vcfg").refresh(true);
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

        downloadAllCustomers: function () {
            // Show Busy Indicator
            sap.ui.core.BusyIndicator.show(0);
        
            // Simulate a delay for testing
            setTimeout(() => {
                let allData = [];
        
                // Get the current filter type from the model or UI
                let filterType = _v.getModel("vcfg").getProperty("/filterType") || "All"; // Default to "All" if not set
        
                // Apply similarity matching to all groups in _allSuspectData
                this._allSuspectData.forEach(group => {
                    this.applySimilarityMatching(_cfg.threshold, group); // Apply matching to each group
                });
        
                // Process and prepare the data for export based on the current filter
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
        
                // Add the data rows to the headerData array
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
            }, 1000); // Simulate a 1-second delay
        },
        downloadGroupCustomers: function () {
            // Show Busy Indicator
            sap.ui.core.BusyIndicator.show(0);
        
            // Simulate a delay for testing
            setTimeout(() => {
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
        
                // Apply similarity matching to the selected group
                this.applySimilarityMatching(_cfg.threshold, selectedGroup);
        
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
            }, 1000); // Simulate a 1-second delay
        },

        formatMatchGroupState: function (matchGroup) {
            if (!matchGroup) return "None"; // No color if no match group

            // Extract the similarity threshold and group number from the MatchGroup value
            let matchParts = matchGroup.split("_");
            if (matchParts.length >= 3) {
                let groupNumber = matchParts[2]; // Get the group number (e.g., 1, 2, 3, etc.)

                // Assign different states (colors) based on the group number
                switch (groupNumber % 5) { // Use modulo to cycle through 5 colors
                    case 1: return "Success"; // Green
                    case 2: return "Warning"; // Yellow
                    case 3: return "Error";   // Red
                    case 4: return "Information"; // Blue
                    case 0: return "Indication07"; // Purple
                    default: return "None";
                }
            }
            return "None"; // Default no color
        },

    });
});
