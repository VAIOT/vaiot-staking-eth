pragma solidity ^0.5.16;

import '@openzeppelin/contracts/token/ERC20/IERC20.sol';
import '@openzeppelin/contracts/ownership/Ownable.sol';

import './StakingRewards.sol';

contract StakingRewardsFactory is Ownable {
    // immutables
    address public rewardsToken;
    uint public stakingRewardsGenesis;

    // the staking tokens for which the rewards contract has been deployed
    address[] public stakingTokens;

    // rewards info by staking token
    mapping(address => address) public stakingRewardsAddressByStakingToken;

    constructor(
        address _rewardsToken,
        uint _stakingRewardsGenesis
    ) Ownable() public {
        require(_stakingRewardsGenesis >= block.timestamp, 'StakingRewardsFactory::constructor: genesis too soon');

        rewardsToken = _rewardsToken;
        stakingRewardsGenesis = _stakingRewardsGenesis;
    }

    ///// permissioned functions

    // deploy a staking reward contract for the staking token, and store the reward amount
    // the reward will be distributed to the staking reward contract no sooner than the genesis
    function deploy(address stakingToken) public onlyOwner {
        address rewardsAddress = stakingRewardsAddressByStakingToken[stakingToken];
        require(rewardsAddress == address(0), 'StakingRewardsFactory::deploy: already deployed');

        rewardsAddress = address(new StakingRewards(/*_rewardsDistribution=*/ address(this), rewardsToken, stakingToken));
        stakingTokens.push(stakingToken);
        stakingRewardsAddressByStakingToken[stakingToken] = rewardsAddress;
    }

    // notify reward amount for an individual staking token.
    // this is a fallback in case the notifyRewardAmounts costs too much gas to call for all contracts
    function notifyRewardAmount(address stakingToken, uint256 amount) public onlyOwner {
        require(block.timestamp >= stakingRewardsGenesis, 'StakingRewardsFactory::notifyRewardAmount: not ready');

        address rewardsAddress = stakingRewardsAddressByStakingToken[stakingToken];
        require(rewardsAddress != address(0), 'StakingRewardsFactory::notifyRewardAmount: not deployed');

        if (amount > 0) {
            require(
                IERC20(rewardsToken).transfer(rewardsAddress, amount),
                'StakingRewardsFactory::notifyRewardAmount: transfer failed'
            );
            StakingRewards(rewardsAddress).notifyRewardAmount(amount);
        }
    }
}