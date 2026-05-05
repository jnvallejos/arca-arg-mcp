export type TipoPersona = 'FISICA' | 'JURIDICA';
export type EstadoClave = 'ACTIVO' | 'INACTIVO' | 'BAJA';
export type EstadoImpuesto = 'ACTIVO' | 'INACTIVO' | 'BAJA';

export interface ActividadPadron {
  idActividad: number;
  descripcionActividad: string;
  periodo: string;
  orden: number;
  nomenclador: number;
}

export interface ImpuestoPadron {
  idImpuesto: number;
  descripcionImpuesto: string;
  periodo: string;
  estado: EstadoImpuesto;
}

export interface CategoriaMonotributo {
  descripcionCategoria: string;
  periodo: string;
}

export interface DomicilioPadron {
  direccion: string;
  localidad: string;
  codPostal: string;
  descripcionProvincia: string;
  tipoDomicilio: string;
  estado: string;
}

export interface PersonaFisicaPadron {
  tipoPersona: 'FISICA';
  cuit: string;
  estadoClave: EstadoClave;
  nombre: string;
  apellido: string;
  tipoDocumento?: string;
  numeroDocumento?: string;
  fechaNacimiento?: string;
  mesCierre?: number;
  domicilios: DomicilioPadron[];
  actividades: ActividadPadron[];
  impuestos: ImpuestoPadron[];
  categoriaMonotributo: CategoriaMonotributo | null;
}

export interface PersonaJuridicaPadron {
  tipoPersona: 'JURIDICA';
  cuit: string;
  estadoClave: EstadoClave;
  razonSocial: string;
  fechaContratoSocial?: string;
  mesCierre?: number;
  domicilios: DomicilioPadron[];
  actividades: ActividadPadron[];
  impuestos: ImpuestoPadron[];
  categoriaMonotributo: CategoriaMonotributo | null;
}

export type PersonaPadron = PersonaFisicaPadron | PersonaJuridicaPadron;
