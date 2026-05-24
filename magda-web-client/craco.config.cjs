const { isEqual } = require("lodash");
const FilterWarningsPlugin = require("webpack-filter-warnings-plugin");
const NodePolyfillPlugin = require("node-polyfill-webpack-plugin");
const { IgnorePlugin, ProvidePlugin } = require("webpack");
const TerserPlugin = require("terser-webpack-plugin");
const path = require("path");

require("dotenv").config();
if (process.env.NODE_PATH && !path.isAbsolute(process.env.NODE_PATH)) {
    process.env.NODE_PATH = path.resolve(__dirname, process.env.NODE_PATH);
}
if (process.env.SASS_PATH && !path.isAbsolute(process.env.SASS_PATH)) {
    process.env.SASS_PATH = path.resolve(__dirname, process.env.SASS_PATH);
}

module.exports = {
    babel: {
        //plugins: ["@babel/plugin-proposal-optional-chaining"]
    },
    webpack: {
        configure(webpackConfig) {
            const minimizers = webpackConfig.optimization.minimizer.filter(
                (min) => !(min instanceof TerserPlugin)
            );
            webpackConfig.optimization.minimizer = [
                new TerserPlugin({
                    exclude: /alasql/
                }),
                ...minimizers
            ];

            const updatedRules = webpackConfig.module.rules.filter(
                (rule) => !isEqual(rule, { parser: { requireEnsure: false } })
            );
            webpackConfig.module.rules = updatedRules;

            // For some reason the unusual structure of lexicon.js causes babel-web-server to take 20 minutes to compile.
            // Exclude it
            webpackConfig.module.rules = webpackConfig.module.rules.map(
                (rule) => {
                    if (rule.oneOf) {
                        rule.oneOf.forEach((rule) => {
                            if (
                                rule.options &&
                                rule.options.presets &&
                                rule.options.presets.length &&
                                rule.options.presets[0].some &&
                                rule.options.presets[0].some(
                                    (preset) =>
                                        preset.indexOf(
                                            "babel-preset-react-app"
                                        ) > -1
                                ) &&
                                !rule.include
                            ) {
                                rule.exclude = [
                                    rule.exclude,
                                    /.*\/lexicon.js$/,
                                    /alasql.min.js$/
                                ];
                            }
                        });
                    }

                    return rule;
                }
            );

            // --- mute warnings from mini-css-extract-plugin regarding css order
            // --- css order not always matter. Plus, complete avoid this issue probably require a new way of including component scss files
            webpackConfig.plugins.push(
                new FilterWarningsPlugin({
                    exclude:
                        /mini-css-extract-plugin[^]*Conflicting order between:/
                })
            );

            webpackConfig.plugins.push(new NodePolyfillPlugin());

            // Inject `process` polyfill into every module that references it.
            // NodePolyfillPlugin v4 does not include process by default, but
            // @langchain/core and other deps use process.env at module scope.
            webpackConfig.plugins.push(
                new ProvidePlugin({
                    process: path.resolve(
                        __dirname,
                        "../node_modules/process/browser.js"
                    )
                })
            );

            webpackConfig.module.noParse = [/dist\/alasql\.min\.js$/];

            // Remove CRA's ModuleScopePlugin so aliases can point outside src/
            const ModuleScopePlugin = require("react-dev-utils/ModuleScopePlugin");
            webpackConfig.resolve.plugins = (
                webpackConfig.resolve.plugins || []
            ).filter((p) => !(p instanceof ModuleScopePlugin));

            // alasql package.json is missing exports entries for subpaths used
            // by dynamic imports in sqlUtils.ts; bypass exports field with alias
            // uuid v10 ESM browser build causes "unsafeStringify not exported"
            // when resolved alongside sockjs's old uuid v8; use CJS build instead
            // process/browser is imported by @langchain/core which is strict ESM —
            // it needs the .js extension; alias to the real file to satisfy both
            // the ProvidePlugin injection and direct imports from ESM modules
            webpackConfig.resolve.alias = {
                ...(webpackConfig.resolve.alias || {}),
                "alasql/dist/alasql.min.js": path.resolve(
                    __dirname,
                    "../node_modules/alasql/dist/alasql.min.js"
                ),
                "alasql/modules/xlsx/xlsx.js": path.resolve(
                    __dirname,
                    "../node_modules/alasql/modules/xlsx/xlsx.js"
                ),
                uuid: path.resolve(
                    __dirname,
                    "../node_modules/uuid/dist/cjs/index.js"
                ),
                "process/browser": path.resolve(
                    __dirname,
                    "../node_modules/process/browser.js"
                )
            };

            // ESM packages that import node built-ins or polyfills without .js extensions
            webpackConfig.module.rules.push({
                test: /\.m?js$/,
                include: /node_modules\/(@mlc-ai|pdfjs-dist|@langchain)/,
                resolve: {
                    fullySpecified: false
                }
            });
            webpackConfig.plugins.push(
                new IgnorePlugin({
                    resourceRegExp:
                        /(^fs$|cptable|^es6-promise$|^net$|^tls$|^forever-agent$|^tough-cookie$|^path$|^request$|react-native|^vertx$)/
                })
            );

            webpackConfig.externals = {
                react: "React",
                "react-dom": "ReactDOM",
                "react-router": "ReactRouter",
                "react-router-dom": "ReactRouterDOM"
            };

            webpackConfig.stats = "verbose";

            // auto-detect public path of compiled assets
            webpackConfig.output.publicPath = "auto";

            return webpackConfig;
        }
    }
};
