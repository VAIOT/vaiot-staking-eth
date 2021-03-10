import chai, { expect } from 'chai'
const _ = require('lodash')

import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { preStakingFixture } from './fixtures'
import { mineBlock, expandTo18Decimals } from './utils'

chai.use(solidity)

const preStakingConfig = {
  amounts: [
    BigNumber.from("5300000000000000000000000"),
    BigNumber.from("5400000000000000000000000"),
    BigNumber.from("5500000000000000000000000"),

    BigNumber.from("6800000000000000000000000"),
    BigNumber.from("6900000000000000000000000"),
    BigNumber.from("7000000000000000000000000"),

    BigNumber.from("7100000000000000000000000"),
    BigNumber.from("7700000000000000000000000"),
    BigNumber.from("8500000000000000000000000"),
    BigNumber.from("10000000000000000000000000")
  ],
  daysInterval: BigNumber.from(30)
}

const depositAmount = BigNumber.from("1000000")
const rewardsAmount = BigNumber.from("4676921000000000000000000")
const depositThreshold = BigNumber.from("125000000000")
const bigDepositThreshold = expandTo18Decimals(3000000)
const depositDist = expandTo18Decimals(10000000)

const rewardsConfig = {
  multiplier: BigNumber.from(2),
  rewardRates: [
    {
      anualRewardRate: BigNumber.from(35),
      lowerBound: BigNumber.from(0),
      upperBound: expandTo18Decimals(2500000)
    },
    {
      anualRewardRate: BigNumber.from(37),
      lowerBound: expandTo18Decimals(2500000),
      upperBound: expandTo18Decimals(5000000)
    },
    {
      anualRewardRate: BigNumber.from(39),
      lowerBound: expandTo18Decimals(5000000),
      upperBound: expandTo18Decimals(7500000)
    },
    {
      anualRewardRate: BigNumber.from(41),
      lowerBound: expandTo18Decimals(7500000),
      upperBound: expandTo18Decimals(10000000)
    },
  ]
}

const anualRewardRates = rewardsConfig.rewardRates.map(rewardRate => rewardRate.anualRewardRate.toString())
const lowerBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.lowerBound.toString())
const upperBounds = rewardsConfig.rewardRates.map(rewardRate => rewardRate.upperBound.toString())

const numberOfSecondsInOneDay = 86400

describe('RewardsCalculation', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, rewardsWallet, account1, account2, account3, account4, account5, account6, account7, account8] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet, rewardsWallet], provider)

  let token: Contract
  let preStakingContract: Contract
  beforeEach(async () => {
    const fixture = await loadFixture(preStakingFixture)
    token = fixture.token
    preStakingContract = fixture.preStakingContract
  })

  describe('1. Reward is returned properly', () => {
    beforeEach(async () => {
      await token.connect(wallet).transfer(rewardsWallet.address, depositDist)
      await token.connect(wallet).transfer(account1.address, depositDist)
      await token.connect(wallet).transfer(account2.address, depositDist)
      await token.connect(wallet).transfer(account3.address, depositDist)
      await token.connect(wallet).transfer(account4.address, depositDist)
      await token.connect(wallet).transfer(account5.address, depositDist)
      await token.connect(wallet).transfer(account6.address, depositDist)
      await token.connect(wallet).transfer(account7.address, depositDist)
      await token.connect(wallet).transfer(account8.address, depositDist)

      //allow staking contract
      await token.connect(wallet).approve(preStakingContract.address, depositDist.mul(BigNumber.from(2)))
      await token.connect(rewardsWallet).approve(preStakingContract.address, rewardsAmount)
      await token.connect(account1).approve(preStakingContract.address, depositDist)
      await token.connect(account2).approve(preStakingContract.address, depositDist)
      await token.connect(account3).approve(preStakingContract.address, depositDist)
      await token.connect(account4).approve(preStakingContract.address, depositDist)
      await token.connect(account5).approve(preStakingContract.address, depositDist)
      await token.connect(account6).approve(preStakingContract.address, depositDist)
      await token.connect(account7).approve(preStakingContract.address, depositDist)
      await token.connect(account8).approve(preStakingContract.address, depositDist)

      await preStakingContract.setupStakingLimit(
        preStakingConfig.amounts, preStakingConfig.daysInterval
      )
      await preStakingContract.setupRewards(
        rewardsConfig.multiplier,
        anualRewardRates,
        lowerBounds,
        upperBounds
      )
      await preStakingContract.unpause()
    })

    it('1.1 Vesting schedules', async () => {
      const timestamp = (await provider.getBlock("latest")).timestamp
      await preStakingContract.connect(account1).deposit(preStakingConfig.amounts[0])

      await mineBlock(provider, timestamp + 30 * numberOfSecondsInOneDay)

      let currentReward = await preStakingContract.earned(account1.address)
      expect(currentReward).to.be.lte(expandTo18Decimals(600000))
      console.log("current", currentReward.div(BigNumber.from(10).pow(18)).toString())

      await preStakingContract.connect(account2).deposit(preStakingConfig.amounts[1].sub(preStakingConfig.amounts[0]))
      await mineBlock(provider, timestamp + 60 * numberOfSecondsInOneDay)

      let currentReward2 = await preStakingContract.earned(account1.address)
      currentReward2 = currentReward.add(await preStakingContract.earned(account2.address))

      console.log("current2", currentReward2.div(BigNumber.from(10).pow(18)).toString())
      expect(currentReward2).to.be.lte(expandTo18Decimals(600000))

      await preStakingContract.connect(account3).deposit(preStakingConfig.amounts[2].sub(preStakingConfig.amounts[1]))
      await mineBlock(provider, timestamp + 90 * numberOfSecondsInOneDay)

      let currentReward3 = await preStakingContract.earned(account1.address)
      currentReward3 = currentReward3.add(await preStakingContract.earned(account2.address))
      currentReward3 = currentReward3.add(await preStakingContract.earned(account3.address))

      expect(currentReward3).to.be.lte(expandTo18Decimals(726000))
      console.log("current3", currentReward3.div(BigNumber.from(10).pow(18)).toString(), "    /726 000")

      await preStakingContract.connect(account4).deposit(preStakingConfig.amounts[3].sub(preStakingConfig.amounts[2]))
      await mineBlock(provider, timestamp + 120 * numberOfSecondsInOneDay)

      let currentReward4 = await preStakingContract.earned(account1.address)
      currentReward4 = currentReward4.add(await preStakingContract.earned(account2.address))
      currentReward4 = currentReward4.add(await preStakingContract.earned(account3.address))
      currentReward4 = currentReward4.add(await preStakingContract.earned(account4.address))

      expect(currentReward4).to.be.lte(expandTo18Decimals(1452000))
      console.log("current4", currentReward4.div(BigNumber.from(10).pow(18)).toString(), "    /1 452 000")

      await preStakingContract.connect(account5).deposit(preStakingConfig.amounts[4].sub(preStakingConfig.amounts[3]))
      await mineBlock(provider, timestamp + 150 * numberOfSecondsInOneDay)

      let currentReward5 = await preStakingContract.earned(account1.address)
      currentReward5 = currentReward5.add(await preStakingContract.earned(account2.address))
      currentReward5 = currentReward5.add(await preStakingContract.earned(account3.address))
      currentReward5 = currentReward5.add(await preStakingContract.earned(account4.address))
      currentReward5 = currentReward5.add(await preStakingContract.earned(account5.address))

      expect(currentReward5).to.be.lte(expandTo18Decimals(1597200))
      console.log("current5", currentReward5.div(BigNumber.from(10).pow(18)).toString(), "    /1 597 200")

      await preStakingContract.connect(account6).deposit(preStakingConfig.amounts[5].sub(preStakingConfig.amounts[4]))
      await mineBlock(provider, timestamp + 180 * numberOfSecondsInOneDay)

      let currentReward6 = await preStakingContract.earned(account1.address)
      currentReward6 = currentReward6.add(await preStakingContract.earned(account2.address))
      currentReward6 = currentReward6.add(await preStakingContract.earned(account3.address))
      currentReward6 = currentReward6.add(await preStakingContract.earned(account4.address))
      currentReward6 = currentReward6.add(await preStakingContract.earned(account5.address))
      currentReward6 = currentReward6.add(await preStakingContract.earned(account6.address))

      expect(currentReward6).to.be.lte(expandTo18Decimals(1756920))
      console.log("current6", currentReward6.div(BigNumber.from(10).pow(18)).toString(), "    /1 756 920")

      await preStakingContract.connect(account7).deposit(preStakingConfig.amounts[6].sub(preStakingConfig.amounts[5]))
      await mineBlock(provider, timestamp + 210 * numberOfSecondsInOneDay)

      let currentReward7 = await preStakingContract.earned(account1.address)
      currentReward7 = currentReward7.add(await preStakingContract.earned(account2.address))
      currentReward7 = currentReward7.add(await preStakingContract.earned(account3.address))
      currentReward7 = currentReward7.add(await preStakingContract.earned(account4.address))
      currentReward7 = currentReward7.add(await preStakingContract.earned(account5.address))
      currentReward7 = currentReward7.add(await preStakingContract.earned(account6.address))
      currentReward7 = currentReward7.add(await preStakingContract.earned(account7.address))

     // await expect(currentReward7).to.be.lte(expandTo18Decimals(1932612))
      console.log("current7", currentReward7.div(BigNumber.from(10).pow(18)).toString(), "    /1 932 612")
    
      await preStakingContract.connect(account8).deposit(preStakingConfig.amounts[7].sub(preStakingConfig.amounts[6]))
      await mineBlock(provider, timestamp + 270 * numberOfSecondsInOneDay)

      let currentReward8 = await preStakingContract.earned(account1.address)
      currentReward8 = currentReward8.add(await preStakingContract.earned(account2.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account3.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account4.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account5.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account6.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account7.address))
      currentReward8 = currentReward8.add(await preStakingContract.earned(account8.address))

      //await expect(currentReward8).to.be.lte(expandTo18Decimals(2125873))
      console.log("current8", currentReward8.div(BigNumber.from(10).pow(18)).toString(), "    /2 125 873")

      await preStakingContract.connect(wallet).deposit(preStakingConfig.amounts[9].sub(preStakingConfig.amounts[7]))
      await mineBlock(provider, timestamp + 300 * numberOfSecondsInOneDay)

      let currentReward9 = await preStakingContract.earned(account1.address)
      currentReward9 = currentReward9.add(await preStakingContract.earned(account2.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account3.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account4.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account5.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account6.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account7.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(account8.address))
      currentReward9 = currentReward9.add(await preStakingContract.earned(wallet.address))

      console.log("current9", currentReward9.div(BigNumber.from(10).pow(18)).toString(), "    /4 676 921")
      expect(currentReward9).to.be.lte(expandTo18Decimals(4676921))
    })

    it('1.2 Reward threshold', async () => {
      let baseRewardHistoryLength = await preStakingContract.baseRewardHistoryLength()
      expect(await preStakingContract.baseRewardIndex(baseRewardHistoryLength - 1)).to.be.equal(0)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 136 * numberOfSecondsInOneDay)
      await preStakingContract.connect(account2).deposit(bigDepositThreshold)

      let baseRewardHistoryLength1 = await preStakingContract.baseRewardHistoryLength()
      expect(await preStakingContract.baseRewardIndex(baseRewardHistoryLength1 - 1)).to.be.equal(1)
    })

    it('1.3 Calculating reward', async () => {
      await preStakingContract.connect(account1).deposit(depositAmount)

      const timestamp = (await provider.getBlock("latest")).timestamp
      await mineBlock(provider, timestamp + 330 * numberOfSecondsInOneDay)

      const currentReward = await preStakingContract.earned(account1.address)
      expect(currentReward).to.be.equal(525287)
    })
  })
}) 