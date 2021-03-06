/*jslint indent: 4, maxlen: 100 */
/*globals angular, window */

(function (ng) {
    'use strict';

    var // Constants
        ID_METEO = 6,
        ID_LUX = 7,
        ID_AUTO_WATERING = 9,
        ID_WATER_LEVEL = 13,
        ID_GROUND_HUMIDITY = 10,
        ID_MANUAL_WATERING = 8,
        LS_KEY_URL = 'serverUrl',
        LS_KEY_HAS_AUTH = 'hasAuth',
        LS_KEY_USERNAME = 'authUsername',
        LS_KEY_PASSWORD = 'authPassword',
        REFRESH_INTERVAL = 20 * 1000, // Every 20 seconds
        BASE_HC_CONFIG,

        // Variables
        app;

    BASE_HC_CONFIG = {
        xAxis: {
            categories: []
        },
        yAxis: {
            title: {
                text: null
            }
        },
        series: []
    };

    app = ng.module('SondeReader', [
        'ui.router',
        'ngMaterial',
        'angular-locker',
        'highcharts-ng'
    ]);

    app.config(['$stateProvider', '$urlRouterProvider', function (
        $stateProvider,
        $urlRouterProvider
    ) {
        $stateProvider.state('home', {
            url: '/home',
            controller: 'HomeController',
            templateUrl: 'partials/home.html'
        });

        $stateProvider.state('settings', {
            url: '/settings',
            controller: 'SettingsController',
            templateUrl: 'partials/settings.html'
        });

        $stateProvider.state('detail', {
            url: '/detail/:mode',
            controller: 'DetailController',
            templateUrl: 'partials/detail.html'
        });

        $urlRouterProvider.otherwise('/home');
    }]);

    app.controller('HomeController', ['$scope', '$interval', '$mdToast', 'DataService', function (
        self,
        $interval,
        $mdToast,
        DataService
    ) {
        var // Functions
            getNeeded,
            refresh;

        getNeeded = function () {
            DataService.getHumidity().then(function onSuccess(r) {
                self.humidity = r;
            });

            DataService.getMeteo().then(function onSuccess(r) {
                self.meteo = r;
            });
        };

        refresh = function () {
            DataService.refreshData().then(function () {
                getNeeded();
                // TODO: Less messages
                //$mdToast.showSimple('Données rafraîchies');
            });
        };

        $interval(refresh, REFRESH_INTERVAL);
        getNeeded();

        self.getLastRefresh = DataService.getLastRefresh;
        self.refresh = refresh;
    }]);

    app.controller('SettingsController', ['$scope', 'SettingsService', function (
        self,
        SettingsService
    ) {
        self.settings = {
            url: SettingsService.getServerUrl(),
            hasAuth: SettingsService.getAuth().hasAuth
        };

        if (self.settings.hasAuth) {
            ng.extend(self.settings, SettingsService.getAuth());
        }

        self.$watch('settings.url', function (newValue) {
            SettingsService.setServerUrl(newValue);
        });

        self.$watch('settings.hasAuth', function (newValue) {
            if (!newValue) {
                SettingsService.setAuth({
                    hasAuth: false
                });
            }
        });

        self.$watch('[settings.username, settings.password]', function (newValues) {
            if (!newValues) {
                return;
            }

            if (self.settings.hasAuth) {
                SettingsService.setAuth({
                    hasAuth: true,
                    username: newValues[0],
                    password: newValues[1]
                });
            }
        });
    }]);

    app.controller('DetailController', ['$scope', '$stateParams', 'DataService', function (
        self,
        $stateParams,
        DataService
    ) {
        var // Functions
            meteoAction,
            wateringAction,
            meteoParser,
            pressureParser,
            humidityParser,
            allAction;

        meteoAction = function () {
            DataService.getMeteo().then(function (r) {
                self.meteo = r;
            });
        };

        wateringAction = function () {
            DataService.getHumidity().then(function (r) {
                self.humidity = r;
            });
        };

        allAction = function () {
            if ($stateParams.mode === 'meteo') {
                meteoAction();
            } else if ($stateParams.mode === 'watering') {
                wateringAction();
            }
        };

        meteoParser = function (input) {
            var out,
                dataTemperature = [];

            out = ng.copy(BASE_HC_CONFIG);
            out.yAxis.title.text = 'Température';

            input.forEach(function (chartEntry) {
                out.xAxis.categories.push(chartEntry.d);
                dataTemperature.push(chartEntry.ta);
            });

            out.series.push({
                name: 'Température (°C)',
                data: dataTemperature
            });

            return out;
        };

        pressureParser = function (input) {
            var out,
                dataPressure = [];

            out = ng.copy(BASE_HC_CONFIG);
            out.yAxis.title.text = 'Pression atmosphérique';

            input.forEach(function (chartEntry) {
                out.xAxis.categories.push(chartEntry.d);
                dataPressure.push(parseFloat(chartEntry.ba));
            });

            out.series.push({
                name: 'Pression atmosphérique (hpa)',
                data: dataPressure
            });

            return out;
        };

        humidityParser = function (input) {
            var out,
                data = [];

            out = ng.copy(BASE_HC_CONFIG);
            out.yAxis.title.text = 'Humidité';

            input.forEach(function (chartEntry) {
                out.xAxis.categories.push(chartEntry.d);
                data.push(parseFloat(chartEntry.hu));
            });

            out.series.push({
                name: 'Humidité',
                data: data
            });

            return out;
        };

        allAction();
        self.mode = $stateParams.mode;
        self.meteoParser = meteoParser;
        self.pressureParser = pressureParser;
        self.humidityParser = humidityParser;
        self.setWaterSwitch = DataService.setWaterSwitch;
        self.setWaterAuto = DataService.setWaterAuto;
        self.setWaterThreshold = DataService.setWaterThreshold;

        self.$on('data_updated', allAction);
    }]);

    app.factory('SettingsService', ['locker', '$http', function (locker, $http) {
        var // Variables
            serverUrl,
            auth,

            // Functions
            setServerUrl,
            getServerUrl,
            setAuth,
            getAuth;

        setServerUrl = function (newUrl) {
            locker.put(LS_KEY_URL, newUrl);
            serverUrl = newUrl;
        };

        getServerUrl = function () {
            var out = serverUrl;

            if (!out) {
                return 'http://server.url';
            }

            if (serverUrl.slice(-1) !== '/') {
                out += '/';
            }

            return out;
        };

        setAuth = function (authObj) {
            locker.put(LS_KEY_HAS_AUTH, !!authObj.hasAuth);

            if (authObj.hasAuth) {
                locker.put(LS_KEY_USERNAME, authObj.username);
                locker.put(LS_KEY_PASSWORD, authObj.password);
                $http.defaults.headers.common.Authorization = 'Basic ' + window.btoa(
                    authObj.username + ':' +
                        authObj.password
                );
            }

            auth = authObj;
        };

        getAuth = function () {
            return auth;
        };

        serverUrl = locker.get(LS_KEY_URL, null);
        auth = {
            hasAuth: locker.get(LS_KEY_HAS_AUTH, false)
        };

        if (auth.hasAuth) {
            auth.username = locker.get(LS_KEY_USERNAME, null);
            auth.password = locker.get(LS_KEY_PASSWORD, null);
        }

        return {
            setServerUrl: setServerUrl,
            getServerUrl: getServerUrl,
            setAuth: setAuth,
            getAuth: getAuth
        };
    }]);

    app.factory('DataService', ['$http', '$rootScope', '$q', '$mdToast', 'SettingsService', function (
        $http,
        $rootScope,
        $q,
        $mdToast,
        SettingsService
    ) {
        var // Variables
            allData = null,
            lastRefresh,

            // Functions
            getUrl = SettingsService.getServerUrl,
            generateHeaders,
            refreshData,
            getData,
            getMeteo,
            getHumidity,
            getLastRefresh,
            getChartData,
            setWaterSwitch,
            setWaterAuto,
            setWaterThreshold;

        generateHeaders = function () {
            if (SettingsService.getAuth().hasAuth) {
                return {
                    Authorization: 'Basic ' + window.btoa(
                        SettingsService.getAuth().username + ':' +
                            SettingsService.getAuth().password
                    )
                };
            }

            return {};
        };

        getData = function () {
            var deferred = $q.defer();

            if (allData) {
                deferred.resolve(allData);
            } else {
                refreshData().then(function (newData) {
                    allData = newData;
                    deferred.resolve(allData);
                });
            }

            return deferred.promise;
        };

        refreshData = function () {
            var deferred = $q.defer();

            $http({
                method: 'JSONP',
                url: getUrl() + 'json.htm',
                headers: generateHeaders(),
                params: {
                    jsoncallback: 'JSON_CALLBACK',
                    type: 'devices'
                }
            }).then(function onSuccess(r) {
                // TODO: Ugly, move this
                function toInt(str) {
                    return parseInt(str, 10);
                }

                allData = {
                    meteo: {},
                    humidity: {}
                };

                lastRefresh = Date.now();

                r.data.result.forEach(function (device) {
                    var idx = toInt(device.idx);

                    if (idx === ID_METEO) {
                        allData.meteo.id = idx;
                        allData.meteo.humidity = toInt(device.Humidity);
                        allData.meteo.temp = toInt(device.Temp);
                        allData.meteo.pressure = toInt(device.Barometer);

                    }

                    if (idx === ID_LUX) {
                        allData.meteo.lux = device.Data;
                    }

                    if (idx === ID_GROUND_HUMIDITY) {
                        allData.humidity.id = toInt(idx);
                        allData.humidity.humidity = toInt(device.Humidity);
                    }

                    if (idx === ID_AUTO_WATERING) {
                        allData.humidity.autoBool = device.Status === 'On';
                        allData.humidity.autoThreshold = toInt(device.Level);
                    }

                    if (idx === ID_MANUAL_WATERING) {
                        allData.humidity.watering = device.Status === 'On';
                    }

                    if (idx === ID_WATER_LEVEL) {
                        allData.humidity.waterLevel = device.Data;
                    }
                });

                $rootScope.$broadcast('data_updated');
                deferred.resolve(allData);
            }, function onError() {
                $mdToast.showSimple('Impossible de récupérer les données !');
                deferred.reject();
            });

            return deferred.promise;
        };

        getMeteo = function () {
            return getData().then(function (all) {
                return all.meteo;
            });
        };

        getHumidity = function () {
            return getData().then(function (all) {
                return all.humidity;
            });
        };

        getLastRefresh = function () {
            return lastRefresh;
        };

        getChartData = function (sondeId, type) {
            return $http({
                method: 'JSONP',
                url: getUrl() + 'json.htm',
                headers: generateHeaders(),
                params: {
                    jsoncallback: 'JSON_CALLBACK',
                    type: 'graph',
                    sensor: type,
                    idx: sondeId,
                    range: 'month' // Todo: Ability to set this
                }
            }).then(function onSuccess(r) {
                if (r.data.status === 'ERROR') {
                    $mdToast.showSimple('Impossible de récupérer les données du graphique.');
                    return;
                }

                return r.data.result;
            }, function onError() {
                $mdToast.showSimple('Impossible de récupérer les données du graphique.');
            });
        };

        setWaterSwitch = function (bool) {
            $http({
                method: 'JSONP',
                url: getUrl() + 'json.htm',
                headers: generateHeaders(),
                params: {
                    jsoncallback: 'JSON_CALLBACK',
                    type: 'command',
                    param: 'switchlight',
                    idx: ID_MANUAL_WATERING,
                    switchcmd: bool ? 'On' : 'Off'
                }
            }).then(function onSuccess(r) {
                if (r.data.status === 'ERROR') {
                    $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
                    return;
                }

                refreshData();
            }, function onError() {
                $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
            });
        };

        setWaterAuto = function (bool) {
            $http({
                method: 'JSONP',
                url: getUrl() + 'json.htm',
                headers: generateHeaders(),
                params: {
                    jsoncallback: 'JSON_CALLBACK',
                    type: 'command',
                    param: 'switchlight',
                    idx: ID_AUTO_WATERING,
                    switchcmd: bool ? 'On' : 'Off'
                }
            }).then(function onSuccess(r) {
                if (r.data.status === 'ERROR') {
                    $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
                    return;
                }

                refreshData();
            }, function onError() {
                $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
            });
        };

        setWaterThreshold = function (val) {
            $http({
                method: 'JSONP',
                url: getUrl() + 'json.htm',
                headers: generateHeaders(),
                params: {
                    jsoncallback: 'JSON_CALLBACK',
                    type: 'command',
                    param: 'switchlight',
                    idx: ID_AUTO_WATERING,
                    switchcmd: 'Set Level',
                    level: val
                }
            }).then(function onSuccess(r) {
                if (r.data.status === 'ERROR') {
                    $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
                    return;
                }

                refreshData();
            }, function onError() {
                $mdToast.showSimple('Impossible d\'exécuter l\'action demandée.');
            });
        };

        return {
            refreshData: refreshData,
            getMeteo: getMeteo,
            getHumidity: getHumidity,
            getLastRefresh: getLastRefresh,
            getChartData: getChartData,
            setWaterSwitch: setWaterSwitch,
            setWaterAuto: setWaterAuto,
            setWaterThreshold: setWaterThreshold
        };
    }]);
    app.directive('srChart', [function () {
        var controller;

        controller = ['$scope', '$timeout', 'DataService', function (self, $timeout, DataService) {
            // Todo: $timeout = quick & lazy fix -> please do better
            $timeout(function () {
                self.$apply(function () {
                    DataService.getChartData(self.sonde, self.type).then(function (data) {
                        self.chartConfig = ng.extend({
                            chart: {
                                zoomType: 'xy'
                            },
                            title: {
                                text: null
                            }
                        }, self.parser(data));
                    });
                });
            }, 500);
        }];

        return {
            template: '<highchart config="chartConfig"></highchart>',
            scope: {
                sonde: '=',
                type: '@',
                parser: '='
            },
            restrict: 'E',
            controller: controller
        };
    }]);
}(angular));
