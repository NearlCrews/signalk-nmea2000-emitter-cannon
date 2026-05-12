const path = require("node:path");
const webpack = require("webpack");
const pkg = require("./package.json");

const safeName = pkg.name.replace(/[-@/]/g, "_");

module.exports = {
	entry: "./src/panel/index.tsx",
	mode: "production",
	output: {
		path: path.resolve(__dirname, "public"),
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
	resolve: { extensions: [".tsx", ".ts", ".jsx", ".js"] },
	plugins: [
		new webpack.container.ModuleFederationPlugin({
			name: safeName,
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
