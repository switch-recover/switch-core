import { HardhatUserConfig } from "hardhat/config"
import "@shardlabs/starknet-hardhat-plugin"
import "@nomiclabs/hardhat-etherscan"
import "@nomiclabs/hardhat-ethers"
require("dotenv").config()
import "@nomiclabs/hardhat-waffle"

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.9",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200,
            },
        },
    },
    starknet: {
        venv: "cairo_venv",
        network: "alpha-goerli", // testnet
        // network: "localhost", // testing
        wallets: {
            OpenZeppelin: {
                accountName: "OpenZeppelin",
                modulePath: "starkware.starknet.wallets.open_zeppelin.OpenZeppelinAccount",
                accountPath: "~/.starknet_accounts",
            },
        },
    },
    networks: {
        goerli: {
            url: `https://eth-goerli.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`,
            chainId: 5,
            accounts: [process.env.DEPLOYER_PRIVATE_KEY || ""],
        },
        localhost: {
            url: "http://127.0.0.1:5050",
        },
    },
    etherscan: {
        apiKey: process.env.ETHERSCAN_API_KEY,
    },
    mocha: {
        timeout: "100000",
    },
}

export default config
