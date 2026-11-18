import { useState } from 'react';
import { editFollowUp } from '@/store/actions';
import { Button, Field, Input, Textarea } from '@/components/ui/primitives';
import { Modal } from '@/components/ui/overlays';

/** Edit a supplier follow-up. Saving creates a new version, supersedes pending approvals and re-verifies. */
export function EditFollowUpModal({ id, subject, body, onClose }: { id: string; subject: string; body: string; onClose: () => void }) {
  const [sub, setSub] = useState(subject);
  const [txt, setTxt] = useState(body);
  const [busy, setBusy] = useState(false);
  const changed = sub !== subject || txt !== body;
  return (
    <Modal open onClose={onClose} title="Edit supplier follow-up" subtitle="Saving creates a new version. Any pending approval is superseded and the draft is re-verified." size="lg"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!changed || !sub.trim() || !txt.trim()} onClick={async () => { setBusy(true); await editFollowUp(id, sub, txt); setBusy(false); onClose(); }}>Save new version</Button></>}>
      <div className="space-y-4">
        <Field label="Subject" htmlFor="fu-subject"><Input id="fu-subject" value={sub} onChange={(e) => setSub(e.target.value)} /></Field>
        <Field label="Message" htmlFor="fu-body" hint="The Verification Agent checks that the invoice number is still cited and the amount is unchanged."><Textarea id="fu-body" value={txt} onChange={(e) => setTxt(e.target.value)} rows={12} /></Field>
      </div>
    </Modal>
  );
}
