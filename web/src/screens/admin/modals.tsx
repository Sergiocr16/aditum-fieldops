/* © 2026 Aditum — Aditum FieldOps — Approve / Reject / Reassign modals */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Button, Field, Textarea, Select } from '../../components/ui';
import type { AppCtx } from '../../lib/ctx';
import type { Ticket } from '../../lib/types';

export function RejectModal({ open, onClose, onConfirm }: any) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  const [err, setErr] = useState(false);
  useEffect(() => {
    if (open) {
      setComment('');
      setErr(false);
    }
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={480}
      tone="danger"
      title={t('ticketDetail.rejectTitle')}
      sub={t('ticketDetail.rejectSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            variant="primary"
            style={{ background: 'var(--st-rech-fg)' }}
            icon="xCircle"
            onClick={() => {
              if (!comment.trim()) {
                setErr(true);
                return;
              }
              onConfirm(comment);
            }}
          >
            {t('ticketDetail.rejectConfirm')}
          </Button>
        </>
      }
    >
      <Field label={t('ticketDetail.rejectReason')} required error={err ? t('ticketDetail.rejectRequired') : ''}>
        <Textarea autoFocus placeholder={t('ticketDetail.rejectReasonPh')} value={comment} onChange={(e: any) => { setComment(e.target.value); setErr(false); }} error={err} style={{ minHeight: 110 }} />
      </Field>
    </Modal>
  );
}

export function ApproveModal({ open, onClose, onConfirm }: any) {
  const { t } = useTranslation();
  const [comment, setComment] = useState('');
  useEffect(() => {
    if (open) setComment('');
  }, [open]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={460}
      tone="success"
      title={t('ticketDetail.approveTitle')}
      sub={t('ticketDetail.approveSub')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="success" icon="checkCircle" onClick={() => onConfirm(comment)}>{t('ticketDetail.approve')}</Button>
        </>
      }
    >
      <Field label={t('ticketDetail.approveComment')} hint={t('common.optional')}>
        <Textarea placeholder={t('ticketDetail.approveCommentPh')} value={comment} onChange={(e: any) => setComment(e.target.value)} />
      </Field>
    </Modal>
  );
}

export function ReassignModal({ open, ticket, ctx, onClose, onConfirm }: { open: boolean; ticket: Ticket; ctx: AppCtx; onClose: () => void; onConfirm: (tid: string) => void }) {
  const { t } = useTranslation();
  const [tid, setTid] = useState(ticket?.techId || '');
  useEffect(() => {
    if (open) setTid(ticket?.techId || '');
  }, [open, ticket]);
  return (
    <Modal
      open={open}
      onClose={onClose}
      width={440}
      tone="info"
      title={t('ticketDetail.reassignTitle')}
      sub={ticket ? ticket.num + ' · ' + ticket.title : ''}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
          <Button variant="primary" icon="users" onClick={() => onConfirm(tid)}>{t('ticketDetail.reassign')}</Button>
        </>
      }
    >
      <Field label={t('ticketDetail.reassignTech')}>
        <Select value={tid} onChange={(e: any) => setTid(e.target.value)}>
          <option value="">{t('common.unassigned')}</option>
          {ctx.db.technicians.filter((x) => x.active).map((x) => (
            <option key={x.id} value={x.id}>
              {x.name}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
