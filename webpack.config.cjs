const path = require("node:path");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
	entry: "./src/panel/index.tsx",
	mode: "production",
	output: {
		path: path.resolve(__dirname, "public"),
		filename: "[name].js",
		chunkFilename: "[name].js",
		clean: false,
	},
	module: {
		rules: [
			{
				test: /\.tsx?$/,
				loader: "babel-loader",
				exclude: /node_modules/,
				options: {
					presets: [
						["@babel/preset-typescript", { isTSX: true, allExtensions: true }],
						["@babel/preset-react", { runtime: "automatic" }],
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
				react: { singleton: true, requiredVersion: "^19" },
				"react-dom": { singleton: true, requiredVersion: "^19" },
			},
		}),
	],
};
