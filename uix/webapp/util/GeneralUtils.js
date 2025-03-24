sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/util/Storage"
], function (JSONModel, Storage) {
    "use strict";
    var _cref, _lstore;

    return {
        init() {
            _cref = this;
            _lstore = new Storage(Storage.Type.local, "remotedata");
        },
        initLocalStore() {
            return _lstore;
        },
        getLocalStore() {
            return _lstore;
        },
        removeOdataResponseMetadata(odata) {
            odata.results.map(function (el) {
                delete el.__metadata;
                return el;
            });
            return odata;
        },


     // Add the Levenshtein distance calculation function
     calculateLevenshteinDistance: function (str1, str2) {
            let [m, n] = [str1.length, str2.length];
            let dp = Array(m + 1).fill().map(() => Array(n + 1).fill(0));

            for (let i = 0; i <= m; i++) dp[i][0] = i;
            for (let j = 0; j <= n; j++) dp[0][j] = j;

            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    dp[i][j] = str1[i - 1] === str2[j - 1] 
                        ? dp[i - 1][j - 1] 
                        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
                }
            }
            return dp[m][n];
        },
     // Add the address similarity calculation function
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
    }
    };
});