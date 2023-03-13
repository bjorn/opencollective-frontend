import React from 'react';
import dayjs from 'dayjs';
import { flatten, isEmpty, omit } from 'lodash';
import { FormattedMessage, useIntl } from 'react-intl';

import { fetchCSVFileFromRESTService } from '../lib/api';
import { formatErrorMessage } from '../lib/errors';
import type { Account } from '../lib/graphql/types/v2/graphql';
import { getFromLocalStorage, LOCAL_STORAGE_KEYS } from '../lib/local-storage';

import { PeriodFilterForm } from './filters/PeriodFilter';
import { Flex, Grid } from './Grid';
import MessageBox from './MessageBox';
import { getSelectedPeriodOptionFromInterval, PERIOD_FILTER_PRESETS } from './PeriodFilterPresetsSelect';
import StyledButton from './StyledButton';
import StyledCheckbox from './StyledCheckbox';
import StyledInputField from './StyledInputField';
import StyledModal, { ModalBody, ModalFooter, ModalHeader } from './StyledModal';
import StyledSelect from './StyledSelect';
import { P } from './Text';
import { TOAST_TYPE, useToasts } from './ToastProvider';

const ALL_FIELDS = [
  'date',
  'datetime',
  'id',
  'legacyId',
  'shortId',
  'shortGroup',
  'group',
  'description',
  'type',
  'kind',
  'isRefund',
  'isRefunded',
  'refundId',
  'shortRefundId',
  'displayAmount',
  'amount',
  'paymentProcessorFee',
  'platformFee',
  'hostFee',
  'netAmount',
  'balance',
  'currency',
  'accountSlug',
  'accountName',
  'accountType',
  'accountEmail',
  'oppositeAccountSlug',
  'oppositeAccountName',
  'oppositeAccountType',
  'oppositeAccountEmail',
  'hostSlug',
  'hostName',
  'hostType',
  'orderId',
  'orderLegacyId',
  'orderFrequency',
  'paymentMethodService',
  'paymentMethodType',
  'expenseId',
  'expenseLegacyId',
  'expenseType',
  'expenseTags',
  'payoutMethodType',
  'merchantId',
  'orderMemo',
];

const DEFAULT_FIELDS = [
  'datetime',
  'shortId',
  'shortGroup',
  'description',
  'type',
  'kind',
  'isRefund',
  'isRefunded',
  'shortRefundId',
  'displayAmount',
  'amount',
  'paymentProcessorFee',
  'hostFee',
  'netAmount',
  'balance',
  'currency',
  'accountSlug',
  'accountName',
  'oppositeAccountSlug',
  'oppositeAccountName',
  // Payment Method (for orders)
  'paymentMethodService',
  'paymentMethodType',
  // Type and Payout Method (for expenses)
  'expenseType',
  'expenseTags',
  'payoutMethodType',
  // Extra fields
  'merchantId',
  'orderMemo',
];

const FieldLabels = {
  date: <FormattedMessage defaultMessage="Date" />,
  datetime: <FormattedMessage defaultMessage="Date & Time" />,
  id: <FormattedMessage defaultMessage="Transaction ID" />,
  legacyId: <FormattedMessage defaultMessage="Legacy Transaction ID" />,
  shortId: <FormattedMessage defaultMessage="Short Transaction ID" />,
  shortGroup: <FormattedMessage defaultMessage="Short Group ID" />,
  group: <FormattedMessage defaultMessage="Group ID" />,
  description: <FormattedMessage defaultMessage="Description" />,
  type: <FormattedMessage defaultMessage="Type" />,
  kind: <FormattedMessage defaultMessage="Kind" />,
  isRefund: <FormattedMessage defaultMessage="Is Refund" />,
  isRefunded: <FormattedMessage defaultMessage="Is Refunded" />,
  refundId: <FormattedMessage defaultMessage="Refund ID" />,
  shortRefundId: <FormattedMessage defaultMessage="Short Refund ID" />,
  displayAmount: <FormattedMessage defaultMessage="Display Amount" />,
  amount: <FormattedMessage defaultMessage="Amount" />,
  paymentProcessorFee: <FormattedMessage defaultMessage="Payment Processor Fee" />,
  platformFee: <FormattedMessage defaultMessage="Platform Fee" />,
  hostFee: <FormattedMessage defaultMessage="Host Fee" />,
  netAmount: <FormattedMessage defaultMessage="Net Amount" />,
  balance: <FormattedMessage defaultMessage="Balance" />,
  currency: <FormattedMessage defaultMessage="Currency" />,
  accountSlug: <FormattedMessage defaultMessage="Account Slug" />,
  accountName: <FormattedMessage defaultMessage="Account Name" />,
  accountType: <FormattedMessage defaultMessage="Account Type" />,
  accountEmail: <FormattedMessage defaultMessage="Account Email" />,
  oppositeAccountSlug: <FormattedMessage defaultMessage="Opposite Account Slug" />,
  oppositeAccountName: <FormattedMessage defaultMessage="Opposite Account Name" />,
  oppositeAccountType: <FormattedMessage defaultMessage="Opposite Account Type" />,
  oppositeAccountEmail: <FormattedMessage defaultMessage="Opposite Account Email" />,
  hostSlug: <FormattedMessage defaultMessage="Host Slug" />,
  hostName: <FormattedMessage defaultMessage="Host Name" />,
  hostType: <FormattedMessage defaultMessage="Host Type" />,
  orderId: <FormattedMessage defaultMessage="Order ID" />,
  orderLegacyId: <FormattedMessage defaultMessage="Legacy Order ID" />,
  orderFrequency: <FormattedMessage defaultMessage="Order Frequency" />,
  paymentMethodService: <FormattedMessage defaultMessage="Payment Method Service" />,
  paymentMethodType: <FormattedMessage defaultMessage="Payment Method Type" />,
  expenseId: <FormattedMessage defaultMessage="Expense ID" />,
  expenseLegacyId: <FormattedMessage defaultMessage="Legacy Expense ID" />,
  expenseType: <FormattedMessage defaultMessage="Expense Type" />,
  expenseTags: <FormattedMessage defaultMessage="Expense Tags" />,
  payoutMethodType: <FormattedMessage defaultMessage="Payout Method Type" />,
  merchantId: <FormattedMessage defaultMessage="Merchant ID" />,
  orderMemo: <FormattedMessage defaultMessage="Order Memo" />,
};

enum FIELD_OPTIONS {
  DEFAULT = 'DEFAULT',
  CUSTOM = 'CUSTOM',
}

const FieldOptionsLabels = {
  [FIELD_OPTIONS.DEFAULT]: <FormattedMessage defaultMessage="Default" />,
  [FIELD_OPTIONS.CUSTOM]: <FormattedMessage defaultMessage="Custom" />,
};

const FieldOptions = Object.keys(FIELD_OPTIONS).map(value => ({ value, label: FieldOptionsLabels[value] }));

type ExportTransactionsCSVModalProps = {
  onClose: () => void;
  dateFrom?: string;
  dateTo?: string;
  collective: Account;
  host?: Account;
  accounts?: Account[];
};

const ExportTransactionsCSVModal = ({
  onClose,
  collective,
  dateFrom,
  dateTo,
  host,
  accounts,
  ...props
}: ExportTransactionsCSVModalProps) => {
  const now = new Date().toISOString();
  const isHostReport = Boolean(host);
  const interval = { from: dateFrom, to: dateTo || now };

  const intl = useIntl();
  const { addToast } = useToasts();
  const [exportedRows, setExportedRows] = React.useState(0);
  const [tmpDateInterval, setTmpDateInterval] = React.useState(interval);
  const [fieldOption, setFieldOption] = React.useState(FieldOptions[0].value);
  const [fields, setFields] = React.useState(DEFAULT_FIELDS.reduce((obj, key) => ({ ...obj, [key]: true }), {}));
  const [isValidDateInterval, setIsValidDateInterval] = React.useState(true);
  const [loading, setLoading] = React.useState(false);

  const datePresetSelectedOption = React.useMemo(
    () => getSelectedPeriodOptionFromInterval(tmpDateInterval),
    [tmpDateInterval],
  );
  const datePresetPptions = React.useMemo(() => {
    return Object.keys(PERIOD_FILTER_PRESETS).map(presetKey => ({
      value: presetKey,
      label: PERIOD_FILTER_PRESETS[presetKey].label,
    }));
  }, [intl]);

  const handleFieldOptionsChange = ({ value }) => {
    setFieldOption(value);
    if (value === FIELD_OPTIONS.DEFAULT) {
      setFields(DEFAULT_FIELDS.reduce((obj, key) => ({ ...obj, [key]: true }), {}));
    }
  };

  const handleFieldSwitch = ({ name, checked }) => {
    if (checked) {
      setFields({ ...fields, [name]: true });
    } else {
      setFields(omit(fields, [name]));
    }
  };

  const getUrl = () => {
    const format = 'txt';
    const { from, to } = tmpDateInterval;
    const url = isHostReport
      ? new URL(`${process.env.REST_URL}/v2/${host.slug}/hostTransactions.${format}`)
      : new URL(`${process.env.REST_URL}/v2/${collective.slug}/transactions.${format}`);

    if (isHostReport) {
      url.searchParams.set('fetchAll', '1');
      if (accounts?.length) {
        url.searchParams.set('account', accounts.map(a => a.slug).join(','));
      }
    } else {
      url.searchParams.set('includeChildrenTransactions', '1');
      url.searchParams.set('includeIncognitoTransactions', '1');
      url.searchParams.set('includeGiftCardTransactions', '1');
      if (dateFrom) {
        // Is the diff between dateFrom and dateTo (or today) less than 62 days?
        if (dayjs(to || undefined).unix() - dayjs(from).unix() < 62 * 24 * 60 * 60) {
          url.searchParams.set('fetchAll', '1');
        }
      }
    }

    if (from) {
      url.searchParams.set('dateFrom', from);
    }
    if (to) {
      url.searchParams.set('dateTo', to);
    }
    if (!isEmpty(fields)) {
      url.searchParams.set('fields', Object.keys(fields).join(','));
    }
    return url.toString();
  };

  const handleExport = async () => {
    const accessToken = getFromLocalStorage(LOCAL_STORAGE_KEYS.ACCESS_TOKEN);

    if (!accessToken) {
      return;
    }
    try {
      setLoading(true);
      const url = getUrl();
      const { from, to } = tmpDateInterval;
      let filename = isHostReport ? `${host.slug}-host-transactions` : `${collective.slug}-transactions`;
      if (from) {
        const until = to || dayjs().format('YYYY-MM-DD');
        filename += `-${from}-${until}`;
      }
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const rows = parseInt(response.headers.get('x-exported-rows'), 10);
      setExportedRows(rows);
      if (rows > 100e3) {
        addToast({
          type: TOAST_TYPE.ERROR,
          message: (
            <FormattedMessage
              defaultMessage="Sorry, the requested file is would take too long to be exported. Transactions count {count} above limit."
              values={{ count: rows }}
            />
          ),
        });
        return;
      }
      await fetchCSVFileFromRESTService(url, filename);
      addToast({ type: TOAST_TYPE.SUCCESS, message: <FormattedMessage defaultMessage="File downloaded!" /> });
      onClose();
    } catch (error) {
      addToast({ type: TOAST_TYPE.ERROR, message: formatErrorMessage(intl, error) });
    } finally {
      setLoading(false);
    }
  };

  const expectedTimeInMinutes = Math.round(exportedRows / 1000) > 60 ? Math.round(exportedRows / 1000 / 60) : 1;
  return (
    <StyledModal onClose={onClose} width="100%" maxWidth="576px" {...props}>
      <ModalHeader>
        <FormattedMessage id="ExportTransactionsCSVModal.Title" defaultMessage="Export Transactions" />
      </ModalHeader>
      <ModalBody>
        <Flex justifyContent="space-between" gap="8px" flexDirection="column">
          {isHostReport && accounts?.length && (
            <MessageBox type="warning" withIcon mt={3}>
              <FormattedMessage
                id="ExportTransactionsCSVModal.FilteredCollectivesWarning"
                defaultMessage="This report is affected by the collective filtter and will include all transactions from the following accounts: {accounts}"
                values={{
                  accounts: accounts.map(a => a.slug).join(', '),
                }}
              />
            </MessageBox>
          )}
          <P mt={3} fontSize="18px" fontWeight={700}>
            <FormattedMessage defaultMessage="Date range" />
          </P>
          <StyledInputField
            name="datePresets"
            // mt={4}
            labelFontSize="18px"
          >
            {inputProps => (
              <StyledSelect
                {...inputProps}
                options={datePresetPptions}
                onChange={({ value }) => setTmpDateInterval(PERIOD_FILTER_PRESETS[value].getInterval())}
                value={datePresetSelectedOption}
                width="100%"
                disabled={loading}
              />
            )}
          </StyledInputField>
          <PeriodFilterForm
            onChange={setTmpDateInterval}
            onValidate={setIsValidDateInterval}
            value={tmpDateInterval}
            inputId="daterange"
            disabled={loading}
            omitPresets
          />
        </Flex>
        <StyledInputField
          label={<FormattedMessage defaultMessage="Fields" />}
          labelFontWeight="700"
          labelProps={{ fontWeight: 'bold', fontSize: '16px' }}
          name="fieldOptions"
          mt={4}
          labelFontSize="18px"
          hint={
            fieldOption === FIELD_OPTIONS.DEFAULT
              ? flatten(
                  DEFAULT_FIELDS.map((field, i) => [
                    FieldLabels[field] || field,
                    i < DEFAULT_FIELDS.length - 1 ? ', ' : '.',
                  ]),
                )
              : null
          }
        >
          {inputProps => (
            <StyledSelect
              {...inputProps}
              options={FieldOptions}
              onChange={handleFieldOptionsChange}
              defaultValue={FieldOptions.find(option => option.value === fieldOption)}
              width="100%"
              disabled={loading}
            />
          )}
        </StyledInputField>
        {fieldOption === FIELD_OPTIONS.CUSTOM && (
          <Grid mt={3} gridGap={1} gridTemplateColumns={`1fr 1fr`}>
            {ALL_FIELDS.map(field => (
              <StyledCheckbox
                key={field}
                name={field}
                disabled={loading}
                onChange={handleFieldSwitch}
                checked={fields[field]}
                label={FieldLabels[field] || field}
              />
            ))}
          </Grid>
        )}
        {exportedRows > 10e3 && (
          <MessageBox type="info" withIcon mt={3}>
            <FormattedMessage
              id="ExportTransactionsCSVModal.RowsWarning"
              defaultMessage="We're exporting {rows} {rows, plural, one {row} other {rows}}, this can take up to {expectedTimeInMinutes} {expectedTimeInMinutes, plural, one {minute} other {minutes}}."
              values={{
                rows: exportedRows,
                expectedTimeInMinutes,
              }}
            />
          </MessageBox>
        )}
      </ModalBody>
      <ModalFooter showDivider={false}>
        <Flex justifyContent="flex-end" width="100%">
          <StyledButton
            buttonSize="small"
            buttonStyle="primary"
            onClick={handleExport}
            loading={loading}
            disabled={!isValidDateInterval}
            minWidth={140}
          >
            <FormattedMessage defaultMessage="Export CSV" />
          </StyledButton>
        </Flex>
      </ModalFooter>
    </StyledModal>
  );
};

export default ExportTransactionsCSVModal;
