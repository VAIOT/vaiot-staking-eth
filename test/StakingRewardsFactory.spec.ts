import chai, { expect } from 'chai'
import { Contract, BigNumber } from 'ethers'
import { solidity, MockProvider, createFixtureLoader } from 'ethereum-waffle'

import { stakingRewardsFactoryFixture } from './fixtures'
import { mineBlock } from './utils'

import StakingRewards from '../build/StakingRewards.json'

chai.use(solidity)

describe('StakingRewardsFactory', () => {
  const provider = new MockProvider({
    ganacheOptions: {
      hardfork: 'istanbul',
      mnemonic: 'horn horn horn horn horn horn horn horn horn horn horn horn',
      gasLimit: 9999999,
    },
  })
  const [wallet, wallet1] = provider.getWallets()
  const loadFixture = createFixtureLoader([wallet], provider)

  let rewardsToken: Contract
  let genesis: number
  let rewardAmount: BigNumber
  let stakingRewardsFactory: Contract
  let stakingToken: Contract

  beforeEach('load fixture', async () => {
    const fixture = await loadFixture(stakingRewardsFactoryFixture)
    rewardsToken = fixture.rewardsToken
    genesis = fixture.genesis
    rewardAmount = fixture.rewardAmount
    stakingRewardsFactory = fixture.stakingRewardsFactory
    stakingToken = fixture.stakingToken
  })

  it('deployment gas', async () => {
    const receipt = await provider.getTransactionReceipt(stakingRewardsFactory.deployTransaction.hash)
    expect(receipt.gasUsed).to.eq('2721646')
  })

  describe('#deploy', () => {
    it('pushes the token into the list', async () => {
      await stakingRewardsFactory.deploy(stakingToken.address)
      expect(await stakingRewardsFactory.stakingTokens(0)).to.eq(stakingToken.address)
    })

    it('fails if called twice for same token', async () => {
      await stakingRewardsFactory.deploy(stakingToken.address)
      await expect(stakingRewardsFactory.deploy(stakingToken.address)).to.revertedWith(
        'StakingRewardsFactory::deploy: already deployed'
      )
    })

    it('can only be called by the owner', async () => {
      await expect(stakingRewardsFactory.connect(wallet1).deploy(stakingToken.address)).to.be.revertedWith(
        'Ownable: caller is not the owner'
      )
    })

    it('stores the address of stakingRewards', async () => {
      await stakingRewardsFactory.deploy(stakingToken.address)
      const stakingRewards = await stakingRewardsFactory.stakingRewardsAddressByStakingToken(stakingToken.address)
      expect(await provider.getCode(stakingRewards)).to.not.eq('0x')
    })

    it('deployed staking rewards has correct parameters', async () => {
      await stakingRewardsFactory.deploy(stakingToken.address)
      const stakingRewardsAddress = await stakingRewardsFactory.stakingRewardsAddressByStakingToken(
        stakingToken.address
      )
      const stakingRewards = new Contract(stakingRewardsAddress, StakingRewards.abi, provider)
      expect(await stakingRewards.rewardsDistribution()).to.eq(stakingRewardsFactory.address)
      expect(await stakingRewards.stakingToken()).to.eq(stakingToken.address)
      expect(await stakingRewards.rewardsToken()).to.eq(rewardsToken.address)
    })
  })

  describe('#notifyRewardsAmount', () => {
    it('fails if before genesis time', async () => {
      await expect(stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)).to.be.revertedWith(
        'StakingRewardsFactory::notifyRewardAmount: not ready'
      )
    })

    it('staking reward contract not deployed', async () => {
      await mineBlock(provider, genesis)
      await expect(stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)).to.be.revertedWith(
        'StakingRewardsFactory::notifyRewardAmount: not deployed'
      )
    })

    describe('after deploying staking reward contract', async () => {
      let stakingRewards: Contract
      beforeEach('deploy staking reward contract', async () => {
        await stakingRewardsFactory.deploy(stakingToken.address)
        const stakingRewardsAddress = await stakingRewardsFactory.stakingRewardsAddressByStakingToken(
          stakingToken.address
        )
        stakingRewards = new Contract(stakingRewardsAddress, StakingRewards.abi, provider)
      })

      it('gas', async () => {
        await rewardsToken.transfer(stakingRewardsFactory.address, rewardAmount)
        await mineBlock(provider, genesis)
        const tx = await stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)
        const receipt = await tx.wait()
        expect(receipt.gasUsed).to.eq('117518')
      })

      it('fails if called without sufficient balance', async () => {
        await mineBlock(provider, genesis)
        await expect(stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)).to.be.revertedWith(
          'ERC20: transfer amount exceeds balance' // emitted from rewards token
        )
      })

      it('RewardAdded event emited', async () => {
        await rewardsToken.transfer(stakingRewardsFactory.address, rewardAmount)
        await mineBlock(provider, genesis)
        await expect(stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount))
          .to.emit(stakingRewards, 'RewardAdded')
          .withArgs(rewardAmount)
      })

      it('transfers the reward tokens to the individual contract', async () => {
        await rewardsToken.transfer(stakingRewardsFactory.address, rewardAmount)
        await mineBlock(provider, genesis)
        await stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)
        expect(await rewardsToken.balanceOf(stakingRewards.address)).to.eq(rewardAmount)
      })

      it('succeeds when has sufficient balance and after genesis time', async () => {
        await rewardsToken.transfer(stakingRewardsFactory.address, rewardAmount)
        await mineBlock(provider, genesis)
        await stakingRewardsFactory.notifyRewardAmount(stakingToken.address, rewardAmount)
      })
    })
  })
})
