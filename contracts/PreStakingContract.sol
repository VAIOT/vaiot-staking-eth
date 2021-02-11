pragma solidity ^0.5.16;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Arrays.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/lifecycle/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";

contract PreStakingContract is Pausable, ReentrancyGuard, Ownable {

    using SafeMath for uint256;
    using Math for uint256;
    using Address for address;
    using Arrays for uint256[];

    enum Status {Setup, Running, RewardsDisabled}

    // EVENTS
    event StakeDeposited(address indexed account, uint256 amount);
    event WithdrawInitiated(address indexed account, uint256 amount);
    event WithdrawExecuted(address indexed account, uint256 amount, uint256 reward);

    // STRUCT DECLARATIONS
    struct StakeDeposit {
        uint256 amount;
        uint256 startDate;
        uint256 endDate;
        uint256 startCheckpointIndex;
        uint256 endCheckpointIndex;
        bool exists;
    }

    struct SetupState {
        bool staking;
        bool rewards;
    }

    struct StakingLimitConfig {
        uint256 maxAmount;
        uint256 initialAmount;
        uint256 daysInterval;
        uint256 maxIntervals;
        uint256 unstakingPeriod;
    }

    struct BaseRewardCheckpoint {
        uint256 baseRewardIndex;
        uint256 startTimestamp;
        uint256 endTimestamp;
        uint256 fromBlock;
    }

    struct BaseReward {
        uint256 anualRewardRate;
        uint256 lowerBound;
        uint256 upperBound;
    }

    struct RewardConfig {
        BaseReward[] baseRewards;
        uint256[] upperBounds;
        uint256 multiplier; // percent of the base reward applicable
    }

    // CONTRACT STATE VARIABLES
    IERC20 public token;
    Status public currentStatus;

    SetupState public setupState;
    StakingLimitConfig public stakingLimitConfig;
    RewardConfig public rewardConfig;

    address public rewardsAddress;
    uint256 public launchTimestamp;
    uint256 public currentTotalStake;

    mapping(address => StakeDeposit) private _stakeDeposits;
    BaseRewardCheckpoint[] private _baseRewardHistory;

    // MODIFIERS
    modifier guardMaxStakingLimit(uint256 amount)
    {
        uint256 resultedStakedAmount = currentTotalStake.add(amount);
        uint256 currentStakingLimit = _computeCurrentStakingLimit();
        require(resultedStakedAmount <= currentStakingLimit, "[Deposit] Your deposit would exceed the current staking limit");
        _;
    }

    modifier guardForPrematureWithdrawal()
    {
        uint256 intervalsPassed = _getIntervalsPassed();
        require(intervalsPassed >= stakingLimitConfig.maxIntervals, "[Withdraw] Not enough days passed");
        _;
    }

    modifier onlyContract(address account)
    {
        require(account.isContract(), "[Validation] The address does not contain a contract");
        _;
    }

    modifier onlyDuringSetup()
    {
        require(currentStatus == Status.Setup, "[Lifecycle] Setup is already done");
        _;
    }

    modifier onlyAfterSetup()
    {
        require(currentStatus != Status.Setup, "[Lifecycle] Setup is not done");
        _;
    }

    // PUBLIC FUNCTIONS
    constructor(address _token, address _rewardsAddress)
    onlyContract(_token)
    public
    {
        require(_rewardsAddress != address(0), "[Validation] _rewardsAddress is the zero address");

        token = IERC20(_token);
        rewardsAddress = _rewardsAddress;
        launchTimestamp = now;
        currentStatus = Status.Setup;
        pause();
    }

    function deposit(uint256 amount)
    public
    nonReentrant
    onlyAfterSetup
    whenNotPaused
    guardMaxStakingLimit(amount)
    {
        require(amount > 0, "[Validation] The stake deposit has to be larger than 0");
        require(!_stakeDeposits[msg.sender].exists, "[Deposit] You already have a stake");

        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        stakeDeposit.amount = stakeDeposit.amount.add(amount);
        stakeDeposit.startDate = now;
        stakeDeposit.startCheckpointIndex = _baseRewardHistory.length - 1;
        stakeDeposit.exists = true;

        currentTotalStake = currentTotalStake.add(amount);
        _updateBaseRewardHistory();

        // Transfer the Tokens to this contract
        require(token.transferFrom(msg.sender, address(this), amount), "[Deposit] Something went wrong during the token transfer");
        emit StakeDeposited(msg.sender, amount);
    }

    function initiateWithdrawal()
    external
    whenNotPaused
    onlyAfterSetup
    guardForPrematureWithdrawal
    {
        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        require(stakeDeposit.exists && stakeDeposit.amount != 0, "[Initiate Withdrawal] There is no stake deposit for this account");
        require(stakeDeposit.endDate == 0, "[Initiate Withdrawal] You already initiated the withdrawal");

        stakeDeposit.endDate = now;
        stakeDeposit.endCheckpointIndex = _baseRewardHistory.length - 1;
        emit WithdrawInitiated(msg.sender, stakeDeposit.amount);
    }

    function executeWithdrawal()
    external
    nonReentrant
    whenNotPaused
    onlyAfterSetup
    {
        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        require(stakeDeposit.exists && stakeDeposit.amount != 0, "[Withdraw] There is no stake deposit for this account");
        require(stakeDeposit.endDate != 0, "[Withdraw] Withdraw is not initialized");
        // validate enough days have passed from initiating the withdrawal
        uint256 daysPassed = (now - stakeDeposit.endDate) / 1 days;
        require(stakingLimitConfig.unstakingPeriod <= daysPassed, "[Withdraw] The unstaking period did not pass");

        uint256 amount = stakeDeposit.amount;
        uint256 reward = _computeReward(stakeDeposit);

        stakeDeposit.amount = 0;

        currentTotalStake = currentTotalStake.sub(amount);
        _updateBaseRewardHistory();

        require(token.transfer(msg.sender, amount), "[Withdraw] Something went wrong while transferring your initial deposit");
        require(token.transferFrom(rewardsAddress, msg.sender, reward), "[Withdraw] Something went wrong while transferring your reward");

        emit WithdrawExecuted(msg.sender, amount, reward);
    }

    function toggleRewards(bool enabled)
    external
    onlyOwner
    onlyAfterSetup
    {
        Status newStatus = enabled ? Status.Running : Status.RewardsDisabled;
        require(currentStatus != newStatus, "[ToggleRewards] This status is already set");

        uint256 index;

        if (newStatus == Status.RewardsDisabled) {
            index = rewardConfig.baseRewards.length - 1;
        }

        if (newStatus == Status.Running) {
            index = _computeCurrentBaseReward();
        }

        _insertNewCheckpoint(index);

        currentStatus = newStatus;
    }

    // VIEW FUNCTIONS FOR HELPING THE USER AND CLIENT INTERFACE
    function currentStakingLimit()
    public
    onlyAfterSetup
    view
    returns (uint256)
    {
        return _computeCurrentStakingLimit();
    }

    function currentReward(address account)
    external
    onlyAfterSetup
    view
    returns (uint256 initialDeposit, uint256 reward)
    {
        require(_stakeDeposits[account].exists && _stakeDeposits[account].amount != 0, "[Validation] This account doesn't have a stake deposit");

        StakeDeposit memory stakeDeposit = _stakeDeposits[account];
        stakeDeposit.endDate = now;

        return (stakeDeposit.amount, _computeReward(stakeDeposit));
    }

    function getStakeDeposit()
    external
    onlyAfterSetup
    view
    returns (uint256 amount, uint256 startDate, uint256 endDate, uint256 startCheckpointIndex, uint256 endCheckpointIndex)
    {
        require(_stakeDeposits[msg.sender].exists, "[Validation] This account doesn't have a stake deposit");
        StakeDeposit memory s = _stakeDeposits[msg.sender];

        return (s.amount, s.startDate, s.endDate, s.startCheckpointIndex, s.endCheckpointIndex);
    }

    function baseRewardsLength()
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        return rewardConfig.baseRewards.length;
    }

    function baseReward(uint256 index)
    external
    onlyAfterSetup
    view
    returns (uint256, uint256, uint256)
    {
        BaseReward memory br = rewardConfig.baseRewards[index];

        return (br.anualRewardRate, br.lowerBound, br.upperBound);
    }

    function baseRewardHistoryLength()
    external
    view
    returns (uint256)
    {
        return _baseRewardHistory.length;
    }

    function baseRewardHistory(uint256 index)
    external
    onlyAfterSetup
    view
    returns (uint256, uint256, uint256, uint256)
    {
        BaseRewardCheckpoint memory c = _baseRewardHistory[index];

        return (c.baseRewardIndex, c.startTimestamp, c.endTimestamp, c.fromBlock);
    }

    // OWNER SETUP
    function setupStakingLimit(uint256 maxAmount, uint256 initialAmount, uint256 daysInterval, uint256 unstakingPeriod)
    external
    onlyOwner
    whenPaused
    onlyDuringSetup
    {
        require(maxAmount > 0 && initialAmount > 0 && daysInterval > 0 && unstakingPeriod >= 0, "[Validation] Some parameters are 0");
        require(maxAmount.mod(initialAmount) == 0, "[Validation] maxAmount should be a multiple of initialAmount");

        uint256 maxIntervals = maxAmount.div(initialAmount);
        // set the staking limits
        stakingLimitConfig.maxAmount = maxAmount;
        stakingLimitConfig.initialAmount = initialAmount;
        stakingLimitConfig.daysInterval = daysInterval;
        stakingLimitConfig.unstakingPeriod = unstakingPeriod;
        stakingLimitConfig.maxIntervals = maxIntervals;

        setupState.staking = true;
        _updateSetupState();
    }

    function setupRewards(
        uint256 multiplier,
        uint256[] calldata anualRewardRates,
        uint256[] calldata lowerBounds,
        uint256[] calldata upperBounds
    )
    external
    onlyOwner
    whenPaused
    onlyDuringSetup
    {
        _validateSetupRewardsParameters(multiplier, anualRewardRates, lowerBounds, upperBounds);

        // Setup rewards
        rewardConfig.multiplier = multiplier;

        for (uint256 i = 0; i < anualRewardRates.length; i++) {
            _addBaseReward(anualRewardRates[i], lowerBounds[i], upperBounds[i]);
        }

        uint256 highestUpperBound = upperBounds[upperBounds.length - 1];

        // Add the zero annual reward rate
        _addBaseReward(0, highestUpperBound, highestUpperBound + 10);

        // initiate baseRewardHistory with the first one which should start from 0
        _initBaseRewardHistory();

        setupState.rewards = true;
        _updateSetupState();
    }

    // INTERNAL
    function _updateSetupState()
    private
    {
        if (!setupState.rewards || !setupState.staking) {
            return;
        }

        currentStatus = Status.Running;
    }

    function _computeCurrentStakingLimit()
    private
    view
    returns (uint256)
    {
        uint256 intervalsPassed = _getIntervalsPassed();
        uint256 baseStakingLimit = stakingLimitConfig.initialAmount;

        uint256 intervals = intervalsPassed.min(stakingLimitConfig.maxIntervals - 1);

        // initialLimit * ((now - launchMoment) / interval)
        return baseStakingLimit.add(baseStakingLimit.mul(intervals));
    }

    function _getIntervalsPassed()
    private
    view
    returns (uint256)
    {
        uint256 daysPassed = (now - launchTimestamp) / 1 days;
        return daysPassed / stakingLimitConfig.daysInterval;
    }

    function _computeReward(StakeDeposit memory stakeDeposit)
    private
    view
    returns (uint256)
    {
        uint256 scale = 10 ** 18;
        (uint256 weightedSum, uint256 stakingPeriod) = _computeRewardRatesWeightedSum(stakeDeposit);

        if (stakingPeriod == 0) {
            return 0;
        }

        // scaling weightedSum and stakingPeriod because the weightedSum is in the thousands magnitude
        // and we risk losing detail while rounding
        weightedSum = weightedSum.mul(scale);

        uint256 weightedAverage = weightedSum.div(stakingPeriod);

        // rewardConfig.multiplier is a percentage expressed in 1/10 (a tenth) of a percent hence we divide by 1000
        uint256 accumulator = rewardConfig.multiplier.mul(weightedSum).div(1000);
        uint256 effectiveRate = weightedAverage.add(accumulator);
        uint256 denominator = scale.mul(36500);

        return stakeDeposit.amount.mul(effectiveRate).mul(stakingPeriod).div(denominator);
    }

    function _computeRewardRatesWeightedSum(StakeDeposit memory stakeDeposit)
    private
    view
    returns (uint256, uint256)
    {
        uint256 stakingPeriod = (stakeDeposit.endDate - stakeDeposit.startDate) / 1 days;
        uint256 weight;
        uint256 rate;

        // The contract never left the first checkpoint
        if (stakeDeposit.startCheckpointIndex == stakeDeposit.endCheckpointIndex) {
            rate = _baseRewardFromHistoryIndex(stakeDeposit.startCheckpointIndex).anualRewardRate;

            return (rate.mul(stakingPeriod), stakingPeriod);
        }

        // Computing the first segment base reward
        // User could deposit in the middle of the segment so we need to get the segment from which the user deposited
        // to the moment the base reward changes
        weight = (_baseRewardHistory[stakeDeposit.startCheckpointIndex].endTimestamp - stakeDeposit.startDate) / 1 days;
        rate = _baseRewardFromHistoryIndex(stakeDeposit.startCheckpointIndex).anualRewardRate;
        uint256 weightedSum = rate.mul(weight);

        // Starting from the second checkpoint because the first one is already computed
        for (uint256 i = stakeDeposit.startCheckpointIndex + 1; i < stakeDeposit.endCheckpointIndex; i++) {
            weight = (_baseRewardHistory[i].endTimestamp - _baseRewardHistory[i].startTimestamp) / 1 days;
            rate = _baseRewardFromHistoryIndex(i).anualRewardRate;
            weightedSum = weightedSum.add(rate.mul(weight));
        }

        // Computing the base reward for the last segment
        // days between start timestamp of the last checkpoint to the moment he initialized the withdrawal
        weight = (stakeDeposit.endDate - _baseRewardHistory[stakeDeposit.endCheckpointIndex].startTimestamp) / 1 days;
        rate = _baseRewardFromHistoryIndex(stakeDeposit.endCheckpointIndex).anualRewardRate;
        weightedSum = weightedSum.add(weight.mul(rate));

        return (weightedSum, stakingPeriod);
    }

    function _addBaseReward(uint256 anualRewardRate, uint256 lowerBound, uint256 upperBound)
    private
    {
        rewardConfig.baseRewards.push(BaseReward(anualRewardRate, lowerBound, upperBound));
        rewardConfig.upperBounds.push(upperBound);
    }

    function _initBaseRewardHistory()
    private
    {
        require(_baseRewardHistory.length == 0, "[Logical] Base reward history has already been initialized");

        _baseRewardHistory.push(BaseRewardCheckpoint(0, now, 0, block.number));
    }

    function _updateBaseRewardHistory()
    private
    {
        if (currentStatus == Status.RewardsDisabled) {
            return;
        }

        BaseReward memory currentBaseReward = _currentBaseReward();

        // Do nothing if currentTotalStake is in the current base reward bounds
        if (currentBaseReward.lowerBound <= currentTotalStake && currentTotalStake <= currentBaseReward.upperBound) {
            return;
        }

        uint256 newIndex = _computeCurrentBaseReward();
        _insertNewCheckpoint(newIndex);
    }

    function _insertNewCheckpoint(uint256 newIndex)
    private
    {
        BaseRewardCheckpoint storage oldCheckPoint = _lastBaseRewardCheckpoint();

        if (oldCheckPoint.fromBlock < block.number) {
            oldCheckPoint.endTimestamp = now;
            _baseRewardHistory.push(BaseRewardCheckpoint(newIndex, now, 0, block.number));
        } else {
            oldCheckPoint.baseRewardIndex = newIndex;
        }
    }

    function _currentBaseReward()
    private
    view
    returns (BaseReward memory)
    {
        // search for the current base reward from current total staked amount
        uint256 currentBaseRewardIndex = _lastBaseRewardCheckpoint().baseRewardIndex;

        return rewardConfig.baseRewards[currentBaseRewardIndex];
    }

    function _baseRewardFromHistoryIndex(uint256 index)
    private
    view
    returns (BaseReward memory)
    {
        return rewardConfig.baseRewards[_baseRewardHistory[index].baseRewardIndex];
    }

    function _lastBaseRewardCheckpoint()
    private
    view
    returns (BaseRewardCheckpoint storage)
    {
        return _baseRewardHistory[_baseRewardHistory.length - 1];
    }

    function _computeCurrentBaseReward()
    private
    view
    returns (uint256)
    {
        uint256 index = rewardConfig.upperBounds.findUpperBound(currentTotalStake);

        require(index < rewardConfig.upperBounds.length, "[NotFound] The current total staked is out of bounds");

        return index;
    }

    function _validateSetupRewardsParameters
    (
        uint256 multiplier,
        uint256[] memory anualRewardRates,
        uint256[] memory lowerBounds,
        uint256[] memory upperBounds
    )
    private
    pure
    {
        require(
            anualRewardRates.length > 0 && lowerBounds.length > 0 && upperBounds.length > 0,
            "[Validation] All parameters must have at least one element"
        );
        require(
            anualRewardRates.length == lowerBounds.length && lowerBounds.length == upperBounds.length,
            "[Validation] All parameters must have the same number of elements"
        );
        require(lowerBounds[0] == 0, "[Validation] First lower bound should be 0");
        require(
            (multiplier < 100) && (uint256(100).mod(multiplier) == 0),
            "[Validation] Multiplier should be smaller than 100 and divide it equally"
        );
    }
}