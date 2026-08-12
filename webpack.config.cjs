const path = require("node:path");
const MinimizerPlugin = require("minimizer-webpack-plugin");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
	// The Signal K host loads only the Module Federation container. An ordinary
	// webpack entry would emit an unused main.js that executes before the host
	// initializes the shared React scope.
	entry: {},
	mode: "production",
	optimization: {
		// Favor the shortest internal export names. The panel's public Module
		// Federation contract remains unchanged. Function declaration hoisting is
		// semantics-preserving for these strict production chunks and gives the size
		// budget enough margin to catch future growth instead of build variance.
		mangleExports: "size",
		minimizer: [
			new MinimizerPlugin({
				terserOptions: {
					compress: { passes: 2, hoist_funs: true },
				},
			}),
		],
	},
	output: {
		path: path.resolve(__dirname, "public"),
		filename: "[name].js",
		chunkFilename: "[name].js",
		// build:panel is also useful on its own. Clean here so a removed entry or
		// renamed chunk cannot survive from an earlier build and enter the package.
		clean: true,
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "babel-loader",
				exclude: /node_modules/,
				options: {
					presets: [
						"@babel/preset-typescript",
						["@babel/preset-react", { runtime: "automatic", development: false }],
					],
				},
			},
		],
	},
	resolve: {
		extensions: [".tsx", ".ts", ".jsx", ".js"],
		// Map ESM-style ".js" specifiers onto sibling ".ts" sources so
		// panel-reachable modules can use the same import paths the Node plugin
		// build (esbuild) accepts.
		extensionAlias: {
			".js": [".ts", ".tsx", ".js"],
		},
	},
	plugins: [
		new webpack.container.ModuleFederationPlugin({
			name: safeName,
			// Classic "var" container: remoteEntry.js assigns the panel to the
			// global window[safeName], which is how the Signal K admin UI finds
			// configurator panels. Do NOT switch to library.type "module" or add
			// "type": "module" back to package.json: an ESM container loads only
			// on admin UI 2.27.0+ and silently fails on every older host.
			library: { type: "var", name: safeName },
			filename: "remoteEntry.js",
			exposes: {
				"./PluginConfigurationPanel": "./src/panel/PluginConfigurationPanel",
			},
			shared: {
				// React and React DOM are supplied by Signal K Admin. The shared UI
				// package remains bundled in this remote and must not be added to the
				// share map.
				react: {
					singleton: true,
					requiredVersion: ">=19.2.0 <20.0.0",
					import: false,
				},
				"react-dom": {
					singleton: true,
					requiredVersion: ">=19.2.0 <20.0.0",
					import: false,
				},
			},
		}),
	],
};
