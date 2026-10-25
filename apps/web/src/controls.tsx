import { useId } from 'react';
import { Select } from 'radix-ui';
import { getNonce } from 'get-nonce';
export function SelectControl({
  label,
  value,
  onChange,
  items,
  name,
  disabled = false,
}: {
  label: string;
  value?: string;
  onChange?: (v: string) => void;
  items: { value: string; label: string }[];
  name?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label htmlFor={id}>
      {label}
      <Select.Root
        {...(name ? { name } : {})}
        {...(value !== undefined ? { value } : { defaultValue: items[0]?.value })}
        {...(onChange ? { onValueChange: onChange } : {})}
        disabled={disabled || !items.length}
      >
        <Select.Trigger id={id} className="select-trigger" aria-label={label}>
          <Select.Value placeholder="—" />
          <Select.Icon aria-hidden="true">⌄</Select.Icon>
        </Select.Trigger>
        <Select.Portal>
          <Select.Content className="select-menu" position="popper" sideOffset={5}>
            <Select.Viewport nonce={getNonce()}>
              {items.map((item) => (
                <Select.Item className="select-item" value={item.value} key={item.value}>
                  <Select.ItemText>{item.label}</Select.ItemText>
                  <Select.ItemIndicator>✓</Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.Viewport>
          </Select.Content>
        </Select.Portal>
      </Select.Root>
    </label>
  );
}
