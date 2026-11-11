import {
  type DataSource,
  type EntityManager,
  type EntityTarget,
  type ObjectLiteral,
  Repository,
} from 'typeorm';

/**
 * Base class of the project's custom repositories (Repository pattern, §10).
 * Subclasses are Nest providers constructed with the DataSource:
 *
 *   @Injectable()
 *   export class UserRepository extends BaseRepository<User> {
 *     constructor(dataSource: DataSource) { super(User, dataSource); }
 *   }
 *
 * `withManager(manager)` returns a copy bound to a transaction's EntityManager that keeps the
 * subclass's custom query methods (TypeORM's `manager.withRepository()` cannot be used because
 * it re-invokes the constructor with a different signature).
 */
export abstract class BaseRepository<T extends ObjectLiteral> extends Repository<T> {
  protected constructor(target: EntityTarget<T>, dataSource: DataSource) {
    super(target, dataSource.createEntityManager());
  }

  withManager(manager: EntityManager): this {
    const bound = Object.create(Object.getPrototypeOf(this) as object) as this;
    return Object.assign(bound, {
      target: this.target,
      manager,
      queryRunner: manager.queryRunner,
    });
  }
}
