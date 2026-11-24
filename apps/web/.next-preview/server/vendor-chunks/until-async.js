"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
exports.id = "vendor-chunks/until-async";
exports.ids = ["vendor-chunks/until-async"];
exports.modules = {

/***/ "(ssr)/./node_modules/until-async/lib/index.js":
/*!***********************************************!*\
  !*** ./node_modules/until-async/lib/index.js ***!
  \***********************************************/
/***/ ((__unused_webpack___webpack_module__, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   until: () => (/* binding */ until)\n/* harmony export */ });\n//#region src/index.ts\n/**\n* Gracefully handles a callback that returns a promise.\n*\n* @example\n* await until(() => Promise.resolve(123))\n* // [null, 123]\n*\n* await until(() => Promise.reject(new Error('Oops!')))\n* // [new Error('Oops!'), null]\n*/ async function until(callback) {\n    try {\n        return [\n            null,\n            await callback().catch((error)=>{\n                throw error;\n            })\n        ];\n    } catch (error) {\n        return [\n            error,\n            null\n        ];\n    }\n}\n//#endregion\n //# sourceMappingURL=index.js.map\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHNzcikvLi9ub2RlX21vZHVsZXMvdW50aWwtYXN5bmMvbGliL2luZGV4LmpzIiwibWFwcGluZ3MiOiI7Ozs7QUFBQSxzQkFBc0I7QUFDdEI7Ozs7Ozs7OztBQVNBLEdBQ0EsZUFBZUEsTUFBTUMsUUFBUTtJQUM1QixJQUFJO1FBQ0gsT0FBTztZQUFDO1lBQU0sTUFBTUEsV0FBV0MsS0FBSyxDQUFDLENBQUNDO2dCQUNyQyxNQUFNQTtZQUNQO1NBQUc7SUFDSixFQUFFLE9BQU9BLE9BQU87UUFDZixPQUFPO1lBQUNBO1lBQU87U0FBSztJQUNyQjtBQUNEO0FBRUEsWUFBWTtBQUNLLENBQ2pCLGlDQUFpQyIsInNvdXJjZXMiOlsid2VicGFjazovL0Bwb3J0aXEvd2ViLy4vbm9kZV9tb2R1bGVzL3VudGlsLWFzeW5jL2xpYi9pbmRleC5qcz8zN2MyIl0sInNvdXJjZXNDb250ZW50IjpbIi8vI3JlZ2lvbiBzcmMvaW5kZXgudHNcbi8qKlxuKiBHcmFjZWZ1bGx5IGhhbmRsZXMgYSBjYWxsYmFjayB0aGF0IHJldHVybnMgYSBwcm9taXNlLlxuKlxuKiBAZXhhbXBsZVxuKiBhd2FpdCB1bnRpbCgoKSA9PiBQcm9taXNlLnJlc29sdmUoMTIzKSlcbiogLy8gW251bGwsIDEyM11cbipcbiogYXdhaXQgdW50aWwoKCkgPT4gUHJvbWlzZS5yZWplY3QobmV3IEVycm9yKCdPb3BzIScpKSlcbiogLy8gW25ldyBFcnJvcignT29wcyEnKSwgbnVsbF1cbiovXG5hc3luYyBmdW5jdGlvbiB1bnRpbChjYWxsYmFjaykge1xuXHR0cnkge1xuXHRcdHJldHVybiBbbnVsbCwgYXdhaXQgY2FsbGJhY2soKS5jYXRjaCgoZXJyb3IpID0+IHtcblx0XHRcdHRocm93IGVycm9yO1xuXHRcdH0pXTtcblx0fSBjYXRjaCAoZXJyb3IpIHtcblx0XHRyZXR1cm4gW2Vycm9yLCBudWxsXTtcblx0fVxufVxuXG4vLyNlbmRyZWdpb25cbmV4cG9ydCB7IHVudGlsIH07XG4vLyMgc291cmNlTWFwcGluZ1VSTD1pbmRleC5qcy5tYXAiXSwibmFtZXMiOlsidW50aWwiLCJjYWxsYmFjayIsImNhdGNoIiwiZXJyb3IiXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(ssr)/./node_modules/until-async/lib/index.js\n");

/***/ })

};
;