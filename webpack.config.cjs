const path = require("node:path");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
	entry: "./src/panel/index.tsx",
	mode: "production",
	experiments: { outputModule: true },
	output: {
		path: path.resolve(__dirname, "public"),
		filename: "[name].mjs",
		chunkFilename: "[name].mjs",
		module: true,
		library: { type: "module" },
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
			".mjs": [".mts", ".mjs"],
		},
	},
	plugins: [
		new webpack.container.ModuleFederationPlugin({
			name: safeName,
			library: { type: "module" },
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
