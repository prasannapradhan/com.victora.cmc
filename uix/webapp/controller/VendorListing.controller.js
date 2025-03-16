sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils",
    "sap/m/MessageBox"
], function (Controller, JSONModel, GeneralUtils, MessageBox) {
    "use strict";

    return Controller.extend("com.victora.cmc.uix.controller.CustomerListing", {
        onInit: function () {
            this._view = this.getView();
            this._allSuspectData = []; // Store all suspect data for filtering
            this.showCustomerListing();

            // Initialize empty selected suspect model
            var selectedSuspectModel = new JSONModel({ selectedSuspects: [] });
            this._view.setModel(selectedSuspectModel, "details");
        },

        showCustomerListing: async function () {
            console.log("Fetching customer listing...");

            try {
                var customerModel = new JSONModel();
                await customerModel.loadData("/model/victora_customer_master.json", false);
                var customerData = customerModel.getData();
                console.log("Customer Data:", customerData);

                GeneralUtils.removeOdataResponseMetadata(customerData);
                customerData = customerData.results || [];

                this.processCustomerData(customerData);
            } catch (error) {
                console.error("Error loading customer data:", error);
                MessageBox.error("Failed to load customer data.");
            }
        },

        processCustomerData: function (customerData) {
            var countryMap = {};

            customerData.forEach(e => {
                e.Name = e.Name.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                e.StreetAdd = e.StreetAdd.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                e.Address = e.StreetAdd;

                if (e.City && !e.Address.includes(e.City)) {
                    e.Address += " " + e.City;
                }
                if (e.District && !e.Address.includes(e.District)) {
                    e.Address += " " + e.District;
                }
                e.Address = e.Address.toLowerCase();

                if (!countryMap[e.Country]) {
                    countryMap[e.Country] = {};
                }
                var taxMap = countryMap[e.Country];

                if (!taxMap[e.TaxId]) {
                    taxMap[e.TaxId] = {};
                }
                var pincMap = taxMap[e.TaxId];

                var key = e.Pincode || e.City;
                if (!pincMap[key]) {
                    pincMap[key] = [];
                }
                pincMap[key].push(e);
            });

            this.constructSuspectMap(countryMap);
        },

        calculateLevenshteinDistance: function (str1, str2) {
            var m = str1.length, n = str2.length;
            var dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

            for (var i = 0; i <= m; i++) {
                for (var j = 0; j <= n; j++) {
                    if (i === 0) {
                        dp[i][j] = j;
                    } else if (j === 0) {
                        dp[i][j] = i;
                    } else if (str1[i - 1] === str2[j - 1]) {
                        dp[i][j] = dp[i - 1][j - 1];
                    } else {
                        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                    }
                }
            }

            return dp[m][n];
        },

        calculateAddressSimilarity: function (address1, address2) {
            if (!address1 || !address2) return 0;

            var maxLength = Math.max(address1.length, address2.length);
            if (maxLength === 0) return 100;

            var distance = this.calculateLevenshteinDistance(address1, address2);
            var similarity = ((maxLength - distance) / maxLength) * 100;

            return similarity.toFixed(2); // Convert to percentage
        },

        constructSuspectMap: function (countryMap) {
            var suspectMap = {};

            Object.keys(countryMap).forEach(country => {
                var taxObj = countryMap[country];
                Object.keys(taxObj).forEach(tax => {
                    var pincObj = taxObj[tax];
                    Object.keys(pincObj).forEach(pincode => {
                        var suspects = pincObj[pincode];
                        if (suspects.length > 1) {
                            var suspectKey = `${country}_${tax}_${pincode}`;

                            // Calculate Address Similarities using Levenshtein Distance
                            for (var i = 0; i < suspects.length; i++) {
                                for (var j = i + 1; j < suspects.length; j++) {
                                    var similarity = this.calculateAddressSimilarity(
                                        suspects[i].Address, suspects[j].Address
                                    );
                                    suspects[i].Similarity = similarity;
                                    suspects[j].Similarity = similarity;
                                }
                            }

                            suspectMap[suspectKey] = {
                                key: suspectKey,
                                country: country,
                                displayKey: `${suspectKey} (${suspects.length})`,
                                suspects: suspects
                            };
                        }
                    });
                });
            });

            this._allSuspectData = Object.values(suspectMap);
            this.updateSuspectList("All");
        },

        updateSuspectList: function (filterType) {
            var filteredData;

            switch (filterType) {
                case "National":
                    filteredData = this._allSuspectData.filter(item => item.country.startsWith("IN"));
                    break;
                case "International":
                    filteredData = this._allSuspectData.filter(item => !item.country.startsWith("IN"));
                    break;
                default:
                    filteredData = this._allSuspectData;
            }

            var cmcModel = new JSONModel({ suspects: filteredData });
            this._view.setModel(cmcModel, "cmc");
        },

        onFilterChange: function (oEvent) {
            var selectedKey = oEvent.getParameter("selectedItem").getKey();
            this.updateSuspectList(selectedKey);
        },


        onSelectionChange: function (oEvent) {
            var selectedItem = oEvent.getParameter("listItem");
            var sKey = selectedItem.getBindingContext("cmc").getProperty("key");
            var aSuspects = this._view.getModel("cmc").getProperty("/suspects");

            var suspectData = aSuspects.find(item => item.key === sKey);
            if (suspectData) {
                var suspectDetails = suspectData.suspects.map(suspect => ({
                    Name: suspect.Name,
                    CustomerId: suspect.CustomerId,
                    Address: suspect.Address,
                    Similarity: suspect.Similarity,
                    Region: suspect.Region,
                    Country: suspect.Country
                }));

                var detailsModel = this._view.getModel("details");
                detailsModel.setProperty("/selectedSuspects", suspectDetails);
            }
        },

        onVentorListing: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.navTo("VendorListing");
        },

        onCustomerPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            oRouter.navTo("CustomerListing");
        }
    });
});
