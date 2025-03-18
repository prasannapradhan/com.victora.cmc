sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, GeneralUtils, MessageBox, MessageToast) {
    "use strict";
    
    var _cref = this;
    var currNodeData = {};

    return Controller.extend("com.victora.cmc.uix.controller.CustomerListing", {
        onInit: function () {
            _cref = this;
            this._view = this.getView();
            this._allSuspectData = [];

            // Set initial model with default similarity threshold
            this._view.setModel(new JSONModel({
                selectedSuspects: [],
                similarityThreshold: 95 // Default similarity threshold
            }), "details");

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
                e.StreetAdd = e.StreetAdd.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
        
                // Construct Address for display only (not for comparison)
                e.Address = [e.StreetAdd, e.City, e.District].filter(Boolean).join(", ");
        
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
            this._allSuspectData = Object.entries(countryMap).flatMap(([country, taxObj]) =>
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

            // **Set Default Match Group to 95p**
            this.updateSuspectList("All");
        },

        updateSuspectList: function (filterType) {
            let filteredData = this._allSuspectData.filter(item =>
                filterType === "National" ? item.country.startsWith("IN") :
                    filterType === "International" ? !item.country.startsWith("IN") : true
            );
            this._view.setModel(new JSONModel({ suspects: filteredData }), "cmc");
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
            let suspectData = this._allSuspectData.find(item => item.key === sKey);
            sap.ui.core.BusyIndicator.show(0);
            currNodeData = suspectData;
            _cref.applySimilarityMatching(95);
            sap.ui.core.BusyIndicator.hide();
        },

        onFilterChange: function (oEvent) {
            this.updateSuspectList(oEvent.getParameter("selectedItem").getKey());
        },

        onGoPress: function () {
            let similarityThreshold = parseInt(this._view.byId("percentageInput").getValue(), 10);
            if (isNaN(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 100) {
                MessageBox.error("Please enter a valid percentage between 0 and 100.");
                return;
            }
            this.applySimilarityMatching(similarityThreshold);
            //MessageToast.show(`Match groups updated with ${similarityThreshold}% similarity.`);
        },

        applySimilarityMatching: function (similarityThreshold) {
            sap.ui.core.BusyIndicator.show(0);    
            var opsData = JSON.parse(JSON.stringify(currNodeData));
            if (typeof opsData != "undefined") {
                var suspects = opsData.suspects;
                let alternateSuspects = [];
                var groupCounter = 0;
        
                while (suspects.length > 0) {
                    for (let i = 0; i < suspects.length; i++) {
                        const s = suspects[i];
                        if (i == 0) {
                            s.Duplicate = false;
                            groupCounter++;
                            s.MatchGroup = "P_" + similarityThreshold + "_" + groupCounter;
                            alternateSuspects.push(s);
                        } else {
                            console.log("Comparing StreetAdd:");
                            console.log("StreetAdd 1:", suspects[0].StreetAdd);
                            console.log("StreetAdd 2:", s.StreetAdd);
        
                            // Compare only StreetAdd for similarity
                            let similarity = _cref.calculateAddressSimilarity(suspects[0].StreetAdd, s.StreetAdd);
                            console.log("Similarity Score:", similarity);
        
                            if (similarity >= similarityThreshold) {
                                s.MatchGroup = "P_" + similarityThreshold + "_" + groupCounter;
                                s.Duplicate = true;
                                alternateSuspects.push(s);
                            }
                        }
                    }
                    // Remove all the elements from alternate from main
                    suspects = suspects.filter(e => !alternateSuspects.some(s => s.CustomerId === e.CustomerId));
                }
                // Update the model with the matched suspects
                this._view.getModel("details").setProperty("/selectedSuspects", alternateSuspects);
                sap.ui.core.BusyIndicator.hide();
            } else {
                // Handle the case where opsData is undefined
            }
        },
        onCustomerPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            var oView = this.getView();

            sap.ui.core.BusyIndicator.show(0);

            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("VendorListing");
            }, 1000);
        }


    });
});
