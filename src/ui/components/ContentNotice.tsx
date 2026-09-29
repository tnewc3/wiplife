/** The mature-content notice, shown by the age gate and from Settings. */
export function ContentNotice() {
  return (
    <div className="flex flex-col gap-3 text-base leading-relaxed">
      <p>
        WIPlife is a life simulator for adults. Lives can include mature and difficult themes, written frankly but
        never graphically:
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>Crime, violence and time in jail</li>
        <li>Drinking, drugs, gambling and addiction</li>
        <li>Sex and affairs between adults (suggestive, not explicit)</li>
        <li>Family conflict, neglect and mistreatment in childhood (never graphic, never sexual)</li>
        <li>Illness, death and grief</li>
        <li>Questions of identity, orientation and self-acceptance</li>
      </ul>
      <p>
        Romance and sexual content only ever involve adults. Choices have consequences, and there is always a way back.
      </p>
    </div>
  );
}
