pragma solidity ^0.5.17;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/math/Math.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/Arrays.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/lifecycle/Pausable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/ownership/Ownable.sol";
import "contracts/interfaces/IVAILockup.sol";

contract PreStakingContract is Pausable, ReentrancyGuard, Ownable {

    using SafeMath for uint256;
    using Math for uint256;
    using Address for address;
    using Arrays for uint256[];

    enum ContractStatus {Setup, Running, RewardsDisabled}

    enum DepositStatus {NoDeposit, Deposited, WithdrawalInitialized, WithdrawalExecuted}

    IVAILockup ivaiLockup;

    // EVENTS
    event StakeDeposited(address indexed account, uint256 amount);
    event LookupStakeDeposited(address indexed account, uint256 amount);
    event WithdrawExecuted(address indexed account, uint256 amount, uint256 reward);
    event LookupWithdrawExecuted(address indexed account, uint256 amount, uint256 reward);

    // STRUCT DECLARATIONS
    struct StakeDeposit {
        uint256 amount;
        uint256 startDate;
        uint256 endDate;
        uint256 startCheckpointIndex;
        uint256 endCheckpointIndex;
        bool exists;
        bool lockup;
    }

    struct SetupState {
        bool staking;
        bool rewards;
    }

    struct StakingLimitConfig {
        uint256[] amounts;
        uint256 daysInterval;
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
    ContractStatus public currentContractStatus;

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
        require(now >= (launchTimestamp + ((2 * stakingLimitConfig.daysInterval) * 1 days) + 3 days), "[Withdraw] Not enough days passed");
        _;
    }

    modifier onlyContract(address account)
    {
        require(account.isContract(), "[Validation] The address does not contain a contract");
        _;
    }

    modifier onlyDuringSetup()
    {
        require(currentContractStatus == ContractStatus.Setup, "[Lifecycle] Setup is already done");
        _;
    }

    modifier onlyAfterSetup()
    {
        require(currentContractStatus != ContractStatus.Setup, "[Lifecycle] Setup is not done");
        _;
    }

    // PUBLIC FUNCTIONS
    constructor(address _token, address _rewardsAddress)
    onlyContract(_token) Ownable()
    public
    {
        require(_rewardsAddress != address(0), "[Validation] _rewardsAddress is the zero address");

        token = IERC20(_token);
        rewardsAddress = _rewardsAddress;
        launchTimestamp = now;
        currentContractStatus = ContractStatus.Setup;
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
        stakeDeposit.lockup = false;

        currentTotalStake = currentTotalStake.add(amount);
        _updateBaseRewardHistory();

        // Transfer the Tokens to this contract
        require(token.transferFrom(msg.sender, address(this), amount), "[Deposit] Something went wrong during the token transfer");
        emit StakeDeposited(msg.sender, amount);
    }

    function depositLockup(uint256 amount)
    public
    nonReentrant
    onlyAfterSetup
    whenNotPaused
    {
        require(amount > 0, "[Validation] The stake deposit has to be larger than 0");
        require(!_stakeDeposits[msg.sender].exists, "[Deposit] You already have a stake");
        require(ivaiLockup.beneficiaryCurrentAmount(msg.sender) >= amount, "[Validation] You don't have enough funds");

        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        stakeDeposit.amount = stakeDeposit.amount.add(amount);
        stakeDeposit.startDate = now;
        stakeDeposit.startCheckpointIndex = _baseRewardHistory.length - 1;
        stakeDeposit.exists = true;
        stakeDeposit.lockup = true;

        currentTotalStake = currentTotalStake.add(amount);
        _updateBaseRewardHistory();

        // Transfer the Tokens to this contract
        require(token.transferFrom(address(ivaiLockup), address(this), amount), "[Deposit] Something went wrong during the token transfer");
        
        ivaiLockup.stake(msg.sender, amount);

        emit LookupStakeDeposited(msg.sender, amount);
    }

    function executeWithdrawal()
    external
    nonReentrant
    whenNotPaused
    onlyAfterSetup
    guardForPrematureWithdrawal
    {
        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        require(stakeDeposit.exists && stakeDeposit.amount != 0, "[Withdraw] There is no stake deposit for this account");
        require(stakeDeposit.lockup == false, "[Withdraw] This deposit is lockup");
       
        stakeDeposit.endDate = now;
        stakeDeposit.endCheckpointIndex = _baseRewardHistory.length - 1;

        uint256 amount = stakeDeposit.amount;
        uint256 reward = _computeReward(stakeDeposit);

        stakeDeposit.amount = 0;
        stakeDeposit.startDate = 0;
        stakeDeposit.endDate = 0;
        stakeDeposit.startCheckpointIndex = 0;
        stakeDeposit.endCheckpointIndex = 0;
        stakeDeposit.exists = false;

        currentTotalStake = currentTotalStake.sub(amount);
        _updateBaseRewardHistory();

        require(token.transfer(msg.sender, amount), "[Withdraw] Something went wrong while transferring your initial deposit");
        require(token.transferFrom(rewardsAddress, msg.sender, reward), "[Withdraw] Something went wrong while transferring your reward");

        emit WithdrawExecuted(msg.sender, amount, reward);
    }

    function withdrawLockup()
    external
    nonReentrant
    whenNotPaused
    onlyAfterSetup
    guardForPrematureWithdrawal
    {
        StakeDeposit storage stakeDeposit = _stakeDeposits[msg.sender];
        require(stakeDeposit.exists && stakeDeposit.amount != 0, "[Withdraw] There is no stake deposit for this account");
        require(stakeDeposit.lockup == true, "[Withdraw] This deposit is not lockup");
       
        stakeDeposit.endDate = now;
        stakeDeposit.endCheckpointIndex = _baseRewardHistory.length - 1;

        uint256 amount = stakeDeposit.amount;
        uint256 reward = _computeReward(stakeDeposit);

        stakeDeposit.amount = 0;
        stakeDeposit.startDate = 0;
        stakeDeposit.endDate = 0;
        stakeDeposit.startCheckpointIndex = 0;
        stakeDeposit.endCheckpointIndex = 0;
        stakeDeposit.exists = false;

        currentTotalStake = currentTotalStake.sub(amount);
        _updateBaseRewardHistory();

        require(token.transfer(address(ivaiLockup), amount), "[Withdraw] Something went wrong while transferring your initial deposit");
        require(token.transferFrom(rewardsAddress, address(ivaiLockup), reward), "[Withdraw] Something went wrong while transferring your reward");

        ivaiLockup.unstake(msg.sender, amount, reward);

        emit LookupWithdrawExecuted(msg.sender, amount, reward);
    }

    function toggleRewards(bool enabled)
    external
    onlyOwner
    onlyAfterSetup
    {
        ContractStatus newContractStatus = enabled ? ContractStatus.Running : ContractStatus.RewardsDisabled;
        require(currentContractStatus != newContractStatus, "[ToggleRewards] This status is already set");

        uint256 index;

        if (newContractStatus == ContractStatus.RewardsDisabled) {
            index = rewardConfig.baseRewards.length - 1;
        }

        if (newContractStatus == ContractStatus.Running) {
            index = _computeCurrentBaseReward();
        }

        _insertNewCheckpoint(index);

        currentContractStatus = newContractStatus;
    }

    // VIEW FUNCTIONS FOR HELPING THE USER AND CLIENT INTERFACE
    function isLockup(address account)
    public
    onlyAfterSetup
    view
    returns (bool)
    {
        StakeDeposit memory stakeDeposit = _stakeDeposits[account];
        return stakeDeposit.lockup;
    }

    function currentStakingLimit()
    public
    onlyAfterSetup
    view
    returns (uint256)
    {
        return _computeCurrentStakingLimit();
    }

    function earned(address account)
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        if (!_stakeDeposits[account].exists || _stakeDeposits[account].amount == 0) {
            return 0;
        }
        StakeDeposit memory stakeDeposit = _stakeDeposits[account];
        stakeDeposit.endDate = now;
        stakeDeposit.endCheckpointIndex = _baseRewardHistory.length - 1;

        return (_computeReward(stakeDeposit));
    }

    function balanceOf(address account)
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        StakeDeposit memory stakeDeposit = _stakeDeposits[account];
        return stakeDeposit.amount;
    }

    function status(address account)
    public
    onlyAfterSetup
    view
    returns (DepositStatus)
    {
        if (!_stakeDeposits[account].exists || (_stakeDeposits[account].exists && _stakeDeposits[account].amount == 0)) {
            return DepositStatus.NoDeposit;
        }
        if (_stakeDeposits[account].amount > 0) {
            return _stakeDeposits[account].endDate == 0 ? DepositStatus.Deposited : DepositStatus.WithdrawalInitialized;
        }
        return DepositStatus.WithdrawalExecuted;
    }

    function withdrawalTime(address account)
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        StakeDeposit memory stakeDeposit = _stakeDeposits[account];
        if (status(account) != DepositStatus.WithdrawalInitialized) {
            return 0;
        }
        return stakeDeposit.endDate + (stakingLimitConfig.unstakingPeriod * 1 days);
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

    function rewardRate()
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        BaseReward memory br = rewardConfig.baseRewards[_baseRewardHistory[_baseRewardHistory.length - 1].baseRewardIndex];

        return br.anualRewardRate;
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

    function baseRewardIndex(uint256 index)
    external
    onlyAfterSetup
    view
    returns (uint256)
    {
        BaseRewardCheckpoint memory c = _baseRewardHistory[index];

        return (c.baseRewardIndex);
    }

    function getLimitAmounts()
    external
    view
    returns(uint256[] memory) {
        return stakingLimitConfig.amounts;
    }

    // OWNER SETUP
    function setupStakingLimit(uint256[] calldata amounts, uint256 daysInterval, uint256 unstakingPeriod)
    external
    onlyOwner
    whenPaused
    onlyDuringSetup
    {
        for (uint256 i = 0; i < amounts.length; i++) {
            require(amounts[i] > 0, "[Validation] some of amounts are 0");
            if (i != 0) {
                require(amounts[i] > amounts[i-1], "[Validation] rewards should be in ascending order");
            }
        }
      
        require(daysInterval > 0 && unstakingPeriod >= 0, "[Validation] Some parameters are 0");

        for (uint256 i = 0; i < amounts.length; i++) {
            stakingLimitConfig.amounts.push(amounts[i]);
        }
        stakingLimitConfig.daysInterval = daysInterval;
        stakingLimitConfig.unstakingPeriod = unstakingPeriod;

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

    function setLockupAddress(address lockup)
    public
    onlyOwner
    whenPaused
    onlyDuringSetup
    {
        ivaiLockup = IVAILockup(lockup);
    }

    // INTERNAL
    function _updateSetupState()
    private
    {
        if (!setupState.rewards || !setupState.staking) {
            return;
        }

        currentContractStatus = ContractStatus.Running;
    }

    function _computeCurrentStakingLimit()
    private
    view
    returns (uint256)
    {
        uint256 intervalsPassed = _getIntervalsPassed();
        return stakingLimitConfig.amounts[intervalsPassed];
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
        if (currentContractStatus == ContractStatus.RewardsDisabled) {
            return;
        }

        BaseReward memory currentBaseReward = _currentBaseReward();

        // Do nothing if currentTotalStake is in the current base reward bounds or lower
        if (currentTotalStake <= currentBaseReward.upperBound) {
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