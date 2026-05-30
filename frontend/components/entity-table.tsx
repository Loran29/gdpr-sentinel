import { Entity } from "@/types/models";
import { EntityBadge } from "@/components/entity-badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export function EntityTable({ entities }: { entities: Entity[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Type</TableHead>
          <TableHead>Value</TableHead>
          <TableHead>Context</TableHead>
          <TableHead>Detector</TableHead>
          <TableHead className="text-right">Confidence</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entities.map((entity, index) => (
          <TableRow key={`${entity.type}_${index}`}>
            <TableCell>
              <EntityBadge type={entity.type} />
            </TableCell>
            <TableCell>{entity.value}</TableCell>
            <TableCell>{entity.context}</TableCell>
            <TableCell>{entity.detector}</TableCell>
            <TableCell className="text-right">{(entity.confidence * 100).toFixed(0)}%</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
