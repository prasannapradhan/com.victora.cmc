sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "com/victora/cmc/uix/util/GeneralUtils",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, GeneralUtils, MessageBox, MessageToast) {
    "use strict";

    return Controller.extend("com.victora.cmc.uix.controller.VendorListing", {
        onInit: function () {
            this._view = this.getView();
            this._allSuspectData = [];

            this._view.setModel(new JSONModel({
                selectedSuspects: [],
                similarityThreshold: 80
            }), "details");

            this.showVendorListing();
        },

        showVendorListing: async function () {
            try {
                let vendorModel = new JSONModel();
                await vendorModel.loadData("/model/victora_vendor_master.json", false);
                let vendorData = vendorModel.getData();
                GeneralUtils.removeOdataResponseMetadata(vendorData);
                this.processVendorData(vendorData.results || []);
            } catch (error) {
                MessageBox.error("Failed to load vendor data.");
                console.error("Error loading vendor data:", error);
            }
        },

        processVendorData: function (vendorData) {
            let countryMap = {};
            vendorData.forEach(e => {
                e.Name = e.Name.replace(/[^a-zA-Z0-9]/g, " ").trim().replace(/\s+/g, " ");
                e.Address = [e.StreetAdd, e.City, e.District].filter(Boolean).join(" ").toLowerCase();
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

            this.applySimilarityMatching(80);
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
            let maxLength = Math.max(addr1.length, addr2.length);
            return maxLength ? ((maxLength - this.calculateLevenshteinDistance(addr1, addr2)) / maxLength * 100).toFixed(2) : 100;
        },

        onSelectionChange: function (oEvent) {
            let sKey = oEvent.getParameter("listItem").getBindingContext("cmc").getProperty("key");
    let suspectData = this._allSuspectData.find(item => item.key === sKey);

    if (suspectData) {
        // Show Loader
        sap.ui.core.BusyIndicator.show(0);

        setTimeout(() => {
            this._view.getModel("details").setProperty("/selectedSuspects", suspectData.suspects);
            
            // Hide Loader after processing
            sap.ui.core.BusyIndicator.hide();
        }, 1000); // Simulating some processing delay
    }
},

        onFilterChange: function (oEvent) {
            this.updateSuspectList(oEvent.getParameter("selectedItem").getKey());
        },

        onGoPress: function () {
            let similarityThreshold = parseInt(this._view.byId("vendorPercentageInput").getValue(), 10);
            if (isNaN(similarityThreshold) || similarityThreshold < 0 || similarityThreshold > 100) {
                MessageBox.error("Please enter a valid percentage between 0 and 100.");
                return;
            }

            this.applySimilarityMatching(similarityThreshold);
            MessageToast.show(`Match groups updated with ${similarityThreshold}% similarity.`);
        },

        applySimilarityMatching: function (similarityThreshold) {
            this._allSuspectData.forEach(suspectGroup => {
                let groupCounter = 1;
                let suspects = [...suspectGroup.suspects];

                while (suspects.length > 0) {
                    let baseSuspect = suspects.shift();
                    baseSuspect.MatchGroup = `${similarityThreshold}p${groupCounter}`;
                    let matchedGroup = [baseSuspect];
                    let remaining = [];

                    suspects.forEach(suspect => {
                        let similarity = this.calculateAddressSimilarity(baseSuspect.Address, suspect.Address);
                        if (similarity >= similarityThreshold) {
                            suspect.MatchGroup = `${similarityThreshold}p${groupCounter}`;
                            matchedGroup.push(suspect);
                        } else {
                            remaining.push(suspect);
                        }
                    });

                    suspects = remaining;
                    groupCounter++;
                }
            });

            this._allSuspectData.forEach(suspectGroup => {
                suspectGroup.suspects.sort((a, b) => a.MatchGroup.localeCompare(b.MatchGroup));
            });

            let cmcModel = this._view.getModel("cmc");
            if (cmcModel) {
                cmcModel.refresh(true);
            } else {
                this._view.setModel(new JSONModel({ suspects: this._allSuspectData }), "cmc");
            }

            this._view.getModel("details").setProperty("/selectedSuspects", []);
        },

        onVendorPage: function () {
            var oRouter = sap.ui.core.UIComponent.getRouterFor(this);
            sap.ui.core.BusyIndicator.show(0);

            setTimeout(function () {
                sap.ui.core.BusyIndicator.hide();
                oRouter.navTo("CustomerListing");
            }, 1000);
        }
    });
});
