<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application conventions
- Keep the landing page separate from the existing learning application; all examples are browser-only samples because this project is a marketing front door.
- Store landing-page colors, typography, and responsive layouts in the global semantic design system, with shared Button variants for controls, to preserve the selected direction consistently.
- Keep sample language content in a browser-safe data module and render the learning preview as a focused component so content can change independently of the landing composition.
- Membership buttons must disclose the unavailable purchase handoff until real pricing and the existing app destination are supplied; never simulate a purchase.
