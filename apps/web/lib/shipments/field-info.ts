/** Plain-English explanations for the "i" tips on the shipment forms. Limits mirror schema.ts. */
export const SHIPMENT_FIELD_INFO: Record<string, string> = {
  port_id: "The port where the container will be handled. Port staff there can see this shipment.",
  reference: "Your own name or number for this shipment, such as a PO or booking number. Required.",
  direction: "Import if the goods are arriving at the port, export if they are leaving it.",
  cargo_type:
    "What kind of goods are in the container. Reefer is refrigerated; hazardous and oversized cargo usually take longer.",
  container_size_ft:
    "20 ft: inside 590 × 235 × 239 cm, up to 28,200 kg. 40 ft: inside 1203 × 235 × 239 cm, up to 26,700 kg.",
  booking_type:
    "Full: the whole container is yours. Shared: other importers can add cargo too. You can't change this once cargo has been added.",
  hs_code: "The 6-digit customs code for your goods (Harmonized System), for example 847130.",
  weight_kg: "Total gross weight of the cargo in kilograms. Must be more than 0.",
  declared_value: "The value of the goods in Indian rupees, with two decimal places, for example 250000.00.",
  currency: "All amounts are in Indian rupees (INR).",
  shipping_line: "The carrier moving the container. Pick Other if yours isn't listed.",
  vessel_size_band: "Roughly how big the ship is. Larger ships unload more containers at once, which can mean longer waits.",
  expected_arrival_at: "When the ship is due at the port, in your local time.",
  documentation_status:
    "Whether your shipping papers are ready. Incomplete papers are one of the most common causes of delay.",
  customs_channel:
    "The check customs assigns. Green: no inspection. Orange: document check. Red: physical examination. Use Not known yet if it hasn't been assigned.",
  importer_type:
    "Regular: you import often. AEO-certified: a trusted-trader status that usually clears faster. New: first imports.",
  cargo_priority:
    "Standard for most goods. Expedited for perishable, medical or other urgent cargo. Government for state shipments.",
};
