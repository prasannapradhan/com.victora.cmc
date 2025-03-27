sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (Controller, JSONModel, MessageBox, MessageToast) {
    "use strict";

    // Database configurations for all three data types
    const DB_CONFIG = {
        CUSTOMER_DB: {
            NAME: "CustomerMasterDB",
            STORE: "customers",
            KEY: "customerData",
            URL: "/model/victora_customer_master.json"
        },
        MATERIAL_DB: {
            NAME: "MaterialMasterDB",
            STORE: "materials",
            KEY: "materialData",
            URL: "/model/victora_material_master.json"
        },
        VENDOR_DB: {
            NAME: "VendorMasterDB",
            STORE: "vendors",
            KEY: "vendorData",
            URL: "/model/victora_vendor_master.json"
        }
    };

    return Controller.extend("com.victora.cmc.uix.controller.InitialLoader", {
        onInit: function() {
            this._initializeModels();
            this._setupDatabases();
            
            // For debugging - log all IndexedDB data after setup
            setTimeout(() => this._logAllIndexedDBData(), 2000);
        },

        _initializeModels: function() {
            this.getView().setModel(new JSONModel({
                loading: true,
                progress: "Initializing application...",
                customerLoaded: false,
                materialLoaded: false,
                vendorLoaded: false,
                totalProgress: 0,
                currentStep: 1,
                totalSteps: 3
            }), "loader");
        },

        _setupDatabases: function() {
            this._updateProgress("Starting data initialization...", 0);
            
            // Load all databases sequentially with progress tracking
            this._setupIndexedDB(DB_CONFIG.CUSTOMER_DB)
                .then(() => {
                    this._updateProgress("Customer data loaded successfully", 33);
                    return this._setupIndexedDB(DB_CONFIG.MATERIAL_DB);
                })
                .then(() => {
                    this._updateProgress("Material data loaded successfully", 66);
                    return this._setupIndexedDB(DB_CONFIG.VENDOR_DB);
                })
                .then(() => {
                    this._updateProgress("Vendor data loaded successfully", 100);
                    this._navigateToCustomerListing();
                })
                .catch(error => {
                    console.error("Database setup failed:", error);
                    MessageBox.error("Failed to initialize application data: " + error.message);
                });
        },

        _setupIndexedDB: function(dbConfig) {
            return new Promise((resolve, reject) => {
                this._updateProgress(`Setting up ${dbConfig.NAME.replace('DB', '')} database...`);
                
                const request = indexedDB.open(dbConfig.NAME, 1);
                
                request.onerror = (event) => {
                    console.error("IndexedDB error:", event.target.error);
                    reject(new Error(`Failed to setup ${dbConfig.NAME} database`));
                };
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    this._checkAndLoadData(db, dbConfig)
                        .then(resolve)
                        .catch(reject);
                };
                
                request.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(dbConfig.STORE)) {
                        db.createObjectStore(dbConfig.STORE, { keyPath: 'id' });
                        console.log(`Created object store ${dbConfig.STORE} in ${dbConfig.NAME}`);
                    }
                };
            });
        },

        _checkAndLoadData: function(db, dbConfig) {
            return new Promise((resolve, reject) => {
                this._updateProgress(`Checking for cached ${dbConfig.NAME.replace('DB', '')} data...`);
                
                const transaction = db.transaction([dbConfig.STORE], 'readonly');
                const store = transaction.objectStore(dbConfig.STORE);
                const request = store.get(dbConfig.KEY);
                
                request.onsuccess = (event) => {
                    const storedData = event.target.result;
                    
                    // Log the stored data structure
                    console.group(`IndexedDB Check: ${dbConfig.NAME}`);
                    console.log("Stored data object:", storedData);
                    if (storedData) {
                        console.log("Data timestamp:", new Date(storedData.timestamp));
                        console.log("Data freshness:", 
                            (Date.now() - storedData.timestamp) / 1000 / 60, "minutes old");
                        console.log("Data sample (first 3 items):", 
                            storedData.data?.results?.slice(0, 3) || "No results array");
                    }
                    console.groupEnd();
                    
                    if (storedData && storedData.timestamp && 
                        (Date.now() - storedData.timestamp < 86400000)) {
                        this._updateProgress(`Using cached ${dbConfig.NAME.replace('DB', '')} data`);
                        this._markDataAsLoaded(dbConfig.NAME);
                        resolve();
                    } else {
                        this._loadAndCacheData(db, dbConfig)
                            .then(resolve)
                            .catch(reject);
                    }
                };
                
                request.onerror = (event) => {
                    console.error("Error accessing IndexedDB:", event.target.error);
                    this._loadAndCacheData(db, dbConfig)
                        .then(resolve)
                        .catch(reject);
                };
            });
        },

        _loadAndCacheData: function(db, dbConfig) {
            return new Promise((resolve, reject) => {
                this._updateProgress(`Loading ${dbConfig.NAME.replace('DB', '')} data from server...`);
                
                const model = new JSONModel();
                model.loadData(dbConfig.URL, false)
                    .then(() => {
                        const data = model.getData();
                        
                        // Log the data before storing
                        console.group(`Data Loading: ${dbConfig.NAME}`);
                        console.log("Raw data from server:", data);
                        console.log("Number of records:", data.results?.length || 0);
                        console.log("Sample records:", data.results?.slice(0, 3) || "No results");
                        console.groupEnd();
                        
                        const transaction = db.transaction([dbConfig.STORE], 'readwrite');
                        const store = transaction.objectStore(dbConfig.STORE);
                        const request = store.put({
                            id: dbConfig.KEY,
                            data: data,
                            timestamp: Date.now()
                        });
                        
                        request.onsuccess = () => {
                            console.log(`Successfully stored data in ${dbConfig.NAME}`);
                            this._updateProgress(`${dbConfig.NAME.replace('DB', '')} data loaded successfully`);
                            this._markDataAsLoaded(dbConfig.NAME);
                            resolve();
                        };
                        
                        request.onerror = (event) => {
                            console.error("Error storing data:", event.target.error);
                            reject(new Error(`Failed to store ${dbConfig.NAME} data`));
                        };
                    })
                    .catch(error => {
                        console.error(`Error loading ${dbConfig.NAME} data:`, error);
                        reject(new Error(`Failed to load ${dbConfig.NAME} data from server`));
                    });
            });
        },

        _markDataAsLoaded: function(dbName) {
            const loaderModel = this.getView().getModel("loader");
            
            switch(dbName) {
                case "CustomerMasterDB":
                    loaderModel.setProperty("/customerLoaded", true);
                    break;
                case "MaterialMasterDB":
                    loaderModel.setProperty("/materialLoaded", true);
                    break;
                case "VendorMasterDB":
                    loaderModel.setProperty("/vendorLoaded", true);
                    break;
            }
            
            // Update current step
            const currentStep = loaderModel.getProperty("/currentStep") + 1;
            loaderModel.setProperty("/currentStep", currentStep);
        },

        _updateProgress: function(message, progress) {
            const loaderModel = this.getView().getModel("loader");
            loaderModel.setProperty("/progress", message);
            
            if (progress !== undefined) {
                loaderModel.setProperty("/totalProgress", progress);
            }
        },

        _navigateToCustomerListing: function() {
            this._updateProgress("All data loaded successfully. Redirecting...", 100);
            
            // Small delay to let user see the success message
            setTimeout(() => {
                const oRouter = sap.ui.core.UIComponent.getRouterFor(this);
                oRouter.navTo("CustomerListing");
            }, 1500);
        },

        /**
         * DEBUGGING METHOD: Logs all data from all IndexedDB databases
         */
        _logAllIndexedDBData: function() {
            console.groupCollapsed("DEBUG: All IndexedDB Data");
            
            Object.values(DB_CONFIG).forEach(dbConfig => {
                const request = indexedDB.open(dbConfig.NAME);
                
                request.onsuccess = (event) => {
                    const db = event.target.result;
                    const transaction = db.transaction([dbConfig.STORE], 'readonly');
                    const store = transaction.objectStore(dbConfig.STORE);
                    const request = store.get(dbConfig.KEY);
                    
                    request.onsuccess = (e) => {
                        const result = e.target.result;
                        console.group(`Database: ${dbConfig.NAME}`);
                        console.log("Full stored object:", result);
                        
                        if (result && result.data) {
                            console.log("Data summary:", {
                                recordCount: result.data.results?.length || 0,
                                firstRecord: result.data.results?.[0] || null,
                                lastRecord: result.data.results?.[result.data.results?.length - 1] || null
                            });
                        }
                        
                        console.log("Timestamp:", result?.timestamp ? new Date(result.timestamp) : "No timestamp");
                        console.groupEnd();
                    };
                    
                    request.onerror = (e) => {
                        console.error(`Error reading ${dbConfig.NAME}:`, e.target.error);
                    };
                };
                
                request.onerror = (event) => {
                    console.error(`Error opening ${dbConfig.NAME}:`, event.target.error);
                };
            });
            
            console.groupEnd();
        },

        /**
         * DEBUGGING METHOD: Manually trigger data logging from view if needed
         */
        onDebugData: function() {
            this._logAllIndexedDBData();
            MessageToast.show("IndexedDB data logged to console");
        }
    });
});