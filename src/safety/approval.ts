import type { ToolCallProposal } from "../llm/types.js";

export type ApprovalStatus = "pending" | "approved" | "rejected";

export interface PendingApproval {
  id: string;
  runId: string;
  toolCall: ToolCallProposal;
  status: ApprovalStatus;
  createdAt: Date;
  decidedAt?: Date;
  reviewerNotes?: string;
}

export interface ApprovalHandler {
  /**
   * Called by the runtime when a tool with requiresApproval: true is triggered.
   * Return true to proceed with execution, or false to reject.
   */
  requestApproval(approval: PendingApproval): Promise<boolean>;
}

export class InMemoryApprovalManager {
  private approvals = new Map<string, PendingApproval>();

  public createApproval(runId: string, toolCall: ToolCallProposal): PendingApproval {
    const approval: PendingApproval = {
      id: `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      runId,
      toolCall,
      status: "pending",
      createdAt: new Date(),
    };
    this.approvals.set(approval.id, approval);
    return approval;
  }

  public getApproval(id: string): PendingApproval | undefined {
    return this.approvals.get(id);
  }

  public decide(id: string, status: "approved" | "rejected", reviewerNotes?: string): PendingApproval {
    const approval = this.approvals.get(id);
    if (!approval) {
      throw new Error(`Approval request "${id}" not found.`);
    }
    approval.status = status;
    approval.decidedAt = new Date();
    if (reviewerNotes) approval.reviewerNotes = reviewerNotes;
    return approval;
  }
}
