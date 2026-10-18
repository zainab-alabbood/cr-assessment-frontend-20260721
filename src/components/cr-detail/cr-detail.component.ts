import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { CrApiService } from '../../api/cr-api.service';
import { SessionService } from '../../session/session.service';
import { CrDetail, TimelineEntry } from '../../models/cr.models';
import { idle, loading, ViewState } from '../../common/view-state';
import { computeDiff, DiffRow } from '../diff.util';
import { formatMoney } from '../../common/money.util';
import { canApprovePolicy } from '../../common/permissions';

/**
 * Change Request DETAIL page: loads a CR and renders the diff/preview, the approval timeline, and
 * permission-aware Approve/Reject actions. `load`, the diff binding, and the template skeleton are
 * provided; the timeline ordering, permission gating, actions, and reject validation are yours.
 */
@Component({
	selector: 'app-cr-detail',
	standalone: true,
	imports: [CommonModule, ReactiveFormsModule],
	templateUrl: './cr-detail.component.html',
})
export class CrDetailComponent implements OnInit {
	@Input() id!: string;

	state: ViewState<CrDetail> = idle();
	submitting = false;
	actionError?: string;
	// TODO: add validation so the form is invalid until a reason is entered.
	rejectControl = new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.pattern(/\S/)] });

	constructor(private readonly api: CrApiService, private readonly session: SessionService) {}

	ngOnInit(): void {
		void this.load();
	}

	async load(): Promise<void> {
		this.state = loading();
		this.actionError = undefined;
		try {
			const detail = await this.api.getChangeRequest(this.session.user, this.id);
			this.state = { status: 'loaded', data: detail };
		} catch (err) {
			this.state = { status: 'error', data: null, error: (err as Error).message };
		}
	}

	get detail(): CrDetail | null {
		return this.state.data;
	}

	get diff(): DiffRow[] {
		return this.detail ? computeDiff(this.detail.baselineLineItems, this.detail.proposedLineItems) : [];
	}

	/** Approval timeline, oldest-first. */
	get timeline(): TimelineEntry[] {
		// TODO: return the audit entries ordered chronologically (oldest first).
		return [...(this.detail?.audit ?? [])].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)); // it will show the timeline from the oldest to the news
	}

	/** Whether the current user may approve the loaded CR. */
	get canApprove(): boolean {
		// NOTE: this only looks at the CR status. The UI must also respect the user's permissions.
		return this.detail?.status === 'PENDING_APPROVAL' && canApprovePolicy(this.session.user); //check the status and the user
	}

	get canReject(): boolean {
		return this.canApprove; //same as canApprove
	}

	fmt(amount: number): string {
		return this.detail ? formatMoney(amount, this.detail.currency) : String(amount);
	}

	async approve(): Promise<void> {
		// Guard in code (not only [disabled]) so a fast double click cannot send two requests.
		if (!this.canApprove || this.submitting) return; // Stop if the user can't approve (wrong status or no policy) or a call is already running.
		await this.runAction((at) => this.api.approve(this.session.user, this.id, at)); // Run the shared action helper with the approve API call.
	}

	async reject(): Promise<void> {
		if (!this.canReject || this.submitting) return; // Stop if the user can't reject or a call is already running.
		this.rejectControl.markAsTouched(); // Mark the reason field as touched so its error message can show.
		if (this.rejectControl.invalid) return; // Stop before calling the API if the reason is empty or only spaces.
		const reason = this.rejectControl.value.trim(); // Remove spaces at the start and end of the reason.
		await this.runAction((at) => this.api.reject(this.session.user, this.id, at, reason)); // Run the shared action helper with the reject API call and the reason.
		if (!this.actionError) this.rejectControl.reset(); // Clear the reason field only if the rejection worked.
	}

	private async runAction(call: (at: string) => Promise<CrDetail>): Promise<void> {
		this.submitting = true; // Mark as running (before the await) so buttons are disabled and a second click is blocked.
		this.actionError = undefined; // Clear any error from a previous attempt.
		try {
			const updated = await call(new Date().toISOString()); // Call the API with the current time and wait for the updated CR.
			this.state = { status: 'loaded', data: updated }; // Replace the whole CR so status, timeline and buttons update together.
		} catch (err) {
			this.actionError = (err as Error).message; // On failure, show the error message and keep the old data on screen.
		} finally {
			this.submitting = false; // Always turn the running flag off, so the buttons never get stuck.
		}
	}
}
