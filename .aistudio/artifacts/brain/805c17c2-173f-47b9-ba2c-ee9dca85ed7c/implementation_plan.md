# SearchBiz CSV Upload Lock Toggle Implementation Plan

## Overview & Core Concept
Implement an admin CSV upload lock toggle feature with auto-lock on by default, persistent storage sync, UI badge indicators, and robust handling during bulk purge and website updates (`docker compose up --build -d web`).

## User Review & Critical Decisions
> [!IMPORTANT]
> - **Default State**: Auto-locked by default upon CSV upload with an interactive manual toggle switch.
> - **Visual Badges**: Persistent lock badge indicator displayed on locked ads across admin listing tables.
> - **Purge Handling**: Bulk Purge and single delete actions allow admins to override and remove locked ads when explicitly confirmed.
